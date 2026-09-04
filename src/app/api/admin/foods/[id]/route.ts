import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ApiError, clientIp, handleError, ok } from '@/lib/api'
import { rateLimit } from '@/lib/rate-limit'
import { normalizeFaSearch } from '@/lib/food-search'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'
import type { AdminFoodDto, AdminMealSlot } from '@/lib/types'

/**
 * Owner-only food row operations (see src/lib/admin-auth.ts for the session).
 * NOTE: the small DTO/parse helpers below mirror src/app/api/admin/foods/route.ts
 * on purpose — Next.js route files may only export HTTP handlers, so they
 * cannot import non-handler exports from each other.
 */

const MEAL_SLOTS = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as const

const Per100gSchema = z.object({
  kcal: z.number().min(0).max(950),
  protein: z.number().min(0).max(100),
  carbs: z.number().min(0).max(100),
  fat: z.number().min(0).max(100),
  fiber: z.number().min(0).max(50).nullish(),
  sugar: z.number().min(0).max(100).nullish(),
  sodiumMg: z.number().min(0).max(10_000).nullish(),
})

const ServingSchema = z.object({
  labelFa: z.string().trim().min(1).max(40),
  grams: z.number().min(5).max(2000),
})

const IMAGE_RE = /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/

const PatchSchema = z.object({
  nameFa: z.string().trim().min(2).max(120).optional(),
  nameEn: z.string().trim().max(120).nullish(),
  category: z
    .enum(['MAIN_DISH', 'RICE', 'BREAD', 'DAIRY', 'FRUIT', 'VEGETABLE', 'PROTEIN', 'SNACK', 'DRINK', 'FAST_FOOD', 'SWEET', 'OTHER'])
    .optional(),
  foodType: z.enum(['DISH', 'INGREDIENT', 'BRAND']).optional(),
  isIranian: z.boolean().optional(),
  imageUrl: z.string().regex(IMAGE_RE, 'فرمت تصویر پشتیبانی نمی‌شود.').nullish(),
  per100g: Per100gSchema.optional(),
  servings: z.array(ServingSchema).min(1).max(10).optional(),
  budgetLevel: z.enum(['ECONOMY', 'MID', 'FLEXIBLE']).nullish(),
  mealSlots: z.array(z.enum(MEAL_SLOTS)).max(4).nullish(),
})

const IMAGE_MAX_BYTES = 2 * 1024 * 1024

const round1 = (n: number) => Math.round(n * 10) / 10

const VALID_SLOTS: readonly string[] = MEAL_SLOTS

/** Safe parse of mealSlotsJson → valid AdminMealSlot[] (empty on any failure). */
function parseMealSlots(json: string | null): AdminMealSlot[] {
  if (!json) return []
  try {
    const parsed: unknown = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (s): s is AdminMealSlot => typeof s === 'string' && VALID_SLOTS.includes(s),
    )
  } catch {
    return []
  }
}

function toAdminDto(f: {
  id: string
  nameFa: string
  nameEn: string | null
  category: string
  foodType: string
  isIranian: boolean
  source: string
  confidence: number
  kcalPer100g: number
  proteinPer100g: number
  carbsPer100g: number
  fatPer100g: number
  fiberPer100g: number | null
  imageUrl: string | null
  budgetLevel: string | null
  mealSlotsJson: string | null
  createdAt: Date
  servings: { id: string; labelFa: string; unitType: string; grams: number; isDefault: boolean }[]
}): AdminFoodDto {
  return {
    id: f.id,
    nameFa: f.nameFa,
    nameEn: f.nameEn,
    category: f.category,
    foodType: f.foodType,
    isIranian: f.isIranian,
    source: f.source,
    confidence: f.confidence,
    kcalPer100g: f.kcalPer100g,
    proteinPer100g: f.proteinPer100g,
    carbsPer100g: f.carbsPer100g,
    fatPer100g: f.fatPer100g,
    fiberPer100g: f.fiberPer100g,
    imageUrl: f.imageUrl,
    budgetLevel: (f.budgetLevel as AdminFoodDto['budgetLevel']) ?? null,
    mealSlots: parseMealSlots(f.mealSlotsJson),
    createdAt: f.createdAt.toISOString(),
    servings: f.servings.map((s) => ({
      id: s.id,
      labelFa: s.labelFa,
      unitType: s.unitType,
      grams: s.grams,
      isDefault: s.isDefault,
    })),
  }
}

/**
 * PATCH /api/admin/foods/[id] — partial edit of one bank food.
 * Undefined = keep current value · null = clear (nameEn / imageUrl / tags).
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()

    const rl = rateLimit(`admin-food-patch:${clientIp(req)}`, 30, 60_000)
    if (!rl.allowed) {
      throw new ApiError(429, 'RATE_LIMITED', 'درخواست‌های مکرر. کمی بعد تلاش کن.')
    }

    const { id } = await ctx.params
    const body = PatchSchema.parse(await req.json())

    const existing = await db.food.findUnique({
      where: { id },
      select: { id: true, nameFa: true, nameEn: true },
    })
    if (!existing) {
      throw new ApiError(404, 'FOOD_NOT_FOUND', 'این غذا در بانک پیدا نشد.')
    }

    if (body.imageUrl) {
      const decodedBytes = Math.floor(((body.imageUrl.split(',')[1] ?? '').length * 3) / 4)
      if (decodedBytes > IMAGE_MAX_BYTES) {
        throw new ApiError(413, 'IMAGE_TOO_LARGE', 'حجم عکس زیاد است.')
      }
    }

    // Names change → refresh searchText + keep the exact-name duplicate guard,
    // excluding the food being edited (its own name must not 409 against itself).
    const nameFa = body.nameFa !== undefined ? body.nameFa : existing.nameFa
    const nameEn = body.nameEn !== undefined ? body.nameEn?.trim() || null : existing.nameEn
    const namesChanged = body.nameFa !== undefined || body.nameEn !== undefined

    if (namesChanged) {
      const normName = normalizeFaSearch(nameFa)
      const tokens = normName.split(' ').filter((t) => t.length > 1)
      if (tokens.length > 0) {
        const candidates = await db.food.findMany({
          where: {
            id: { not: id },
            AND: tokens.map((t) => ({ searchText: { contains: t } })),
          },
          select: { nameFa: true },
        })
        const dup = candidates.find((c) => normalizeFaSearch(c.nameFa) === normName)
        if (dup) {
          throw new ApiError(409, 'DUPLICATE_FOOD', `«${dup.nameFa}» از قبل در بانک غذا هست.`)
        }
      }
    }

    const mealSlots = body.mealSlots !== undefined ? [...new Set(body.mealSlots)] : undefined

    const data = {
      ...(namesChanged ? { nameFa, nameEn, searchText: normalizeFaSearch(`${nameFa} ${nameEn ?? ''}`) } : {}),
      ...(body.category !== undefined ? { category: body.category } : {}),
      ...(body.foodType !== undefined ? { foodType: body.foodType } : {}),
      ...(body.isIranian !== undefined ? { isIranian: body.isIranian } : {}),
      ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl ?? null } : {}),
      ...(body.per100g !== undefined
        ? {
            kcalPer100g: round1(body.per100g.kcal),
            proteinPer100g: round1(body.per100g.protein),
            carbsPer100g: round1(body.per100g.carbs),
            fatPer100g: round1(body.per100g.fat),
            fiberPer100g: body.per100g.fiber != null ? round1(body.per100g.fiber) : null,
            sugarPer100g: body.per100g.sugar != null ? round1(body.per100g.sugar) : null,
            sodiumMgPer100g: body.per100g.sodiumMg != null ? round1(body.per100g.sodiumMg) : null,
          }
        : {}),
      ...(body.budgetLevel !== undefined ? { budgetLevel: body.budgetLevel ?? null } : {}),
      ...(mealSlots !== undefined
        ? { mealSlotsJson: mealSlots.length > 0 ? JSON.stringify(mealSlots) : null }
        : {}),
    }

    const hasData = Object.keys(data).length > 0
    if (!hasData && !body.servings) {
      // Nothing to change — return the row as-is.
      const current = await db.food.findUnique({
        where: { id },
        include: { servings: { orderBy: [{ isDefault: 'desc' }, { grams: 'desc' }] } },
      })
      return ok({ food: current ? toAdminDto(current) : null })
    }

    if (body.servings) {
      // Full servings replacement in one transaction.
      await db.$transaction([
        ...(hasData ? [db.food.update({ where: { id }, data })] : []),
        db.foodServing.deleteMany({ where: { foodId: id } }),
        db.foodServing.createMany({
          data: body.servings.map((s, i) => ({
            foodId: id,
            labelFa: s.labelFa,
            unitType: 'CUSTOM',
            grams: s.grams,
            isDefault: i === 0, // first row is the default serving
          })),
        }),
      ])
    } else if (hasData) {
      await db.food.update({ where: { id }, data })
    }

    const updated = await db.food.findUnique({
      where: { id },
      include: { servings: { orderBy: [{ isDefault: 'desc' }, { grams: 'desc' }] } },
    })
    if (!updated) {
      throw new ApiError(404, 'FOOD_NOT_FOUND', 'این غذا در بانک پیدا نشد.')
    }

    return ok({ food: toAdminDto(updated) })
  } catch (err) {
    return handleError(err)
  }
}

/**
 * DELETE /api/admin/foods/[id] — remove one food from the bank.
 * Favorites and servings are cleared explicitly (required relations would
 * otherwise restrict); diary/plan items keep their snapshot with foodId=null.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()

    const rl = rateLimit(`admin-food-del:${clientIp(req)}`, 30, 60_000)
    if (!rl.allowed) {
      throw new ApiError(429, 'RATE_LIMITED', 'درخواست‌های مکرر.')
    }

    const { id } = await ctx.params
    const food = await db.food.findUnique({ where: { id }, select: { id: true, nameFa: true } })
    if (!food) {
      throw new ApiError(404, 'FOOD_NOT_FOUND', 'این غذا در بانک پیدا نشد.')
    }

    await db.favoriteFood.deleteMany({ where: { foodId: id } })
    await db.foodServing.deleteMany({ where: { foodId: id } })
    await db.food.delete({ where: { id } })

    return ok({ deletedId: id, nameFa: food.nameFa })
  } catch (err) {
    return handleError(err)
  }
}
