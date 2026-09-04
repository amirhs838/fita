import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ApiError, clientIp, handleError, ok } from '@/lib/api'
import { rateLimit } from '@/lib/rate-limit'
import { normalizeFaSearch } from '@/lib/food-search'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'
import type { AdminFoodDto, AdminMealSlot } from '@/lib/types'

/**
 * Admin food-bank endpoints — owner-only behind the fita_admin session
 * (see src/lib/admin-auth.ts). Abuse is additionally bounded with IP rate
 * limits, same as every public route.
 */

export const FOOD_CATEGORIES = [
  'MAIN_DISH',
  'RICE',
  'BREAD',
  'DAIRY',
  'FRUIT',
  'VEGETABLE',
  'PROTEIN',
  'SNACK',
  'DRINK',
  'FAST_FOOD',
  'SWEET',
  'OTHER',
] as const

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

const BodySchema = z.object({
  nameFa: z.string().trim().min(2).max(120),
  nameEn: z.string().trim().max(120).optional(),
  category: z.enum(FOOD_CATEGORIES),
  foodType: z.enum(['DISH', 'INGREDIENT', 'BRAND']).default('DISH'),
  isIranian: z.boolean().default(false),
  imageUrl: z
    .string()
    .regex(/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/, 'فرمت تصویر پشتیبانی نمی‌شود.')
    .nullish(),
  per100g: Per100gSchema,
  servings: z.array(ServingSchema).min(1).max(10),
  // Plan-optimizer tags (برنامه‌ساز): budget tier + eligible meal slots.
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

/** GET /api/admin/foods?q=&limit=&plan=1 — bank browser (plan=1 → only tagged plan options). */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin()

    const rl = rateLimit(`admin-foods:${clientIp(req)}`, 90, 60_000)
    if (!rl.allowed) {
      throw new ApiError(429, 'RATE_LIMITED', 'درخواست‌های مکرر.')
    }

    const q = normalizeFaSearch(req.nextUrl.searchParams.get('q') ?? '')
    const planOnly = req.nextUrl.searchParams.get('plan') === '1'
    const defaultLimit = planOnly ? 300 : 60
    const maxLimit = planOnly ? 300 : 100
    const limitRaw = Number(req.nextUrl.searchParams.get('limit') ?? defaultLimit)
    const limit = Number.isFinite(limitRaw)
      ? Math.min(maxLimit, Math.max(1, Math.trunc(limitRaw)))
      : defaultLimit

    const where = {
      ...(planOnly ? { budgetLevel: { not: null }, mealSlotsJson: { not: null } } : {}),
      ...(q
        ? { AND: q.split(' ').filter(Boolean).map((token) => ({ searchText: { contains: token } })) }
        : {}),
    }

    const [foods, total] = await Promise.all([
      db.food.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        take: limit,
        include: { servings: { orderBy: [{ isDefault: 'desc' }, { grams: 'desc' }] } },
      }),
      db.food.count({ where }),
    ])

    return ok({ foods: foods.map(toAdminDto), total })
  } catch (err) {
    return handleError(err)
  }
}

/** POST /api/admin/foods — add one food (photo + name + per-100g + servings + plan tags). */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin()

    const rl = rateLimit(`admin-foods-post:${clientIp(req)}`, 30, 60_000)
    if (!rl.allowed) {
      throw new ApiError(429, 'RATE_LIMITED', 'درخواست‌های مکرر. کمی بعد تلاش کن.')
    }

    const body = BodySchema.parse(await req.json())

    if (body.imageUrl) {
      const decodedBytes = Math.floor(((body.imageUrl.split(',')[1] ?? '').length * 3) / 4)
      if (decodedBytes > IMAGE_MAX_BYTES) {
        throw new ApiError(413, 'IMAGE_TOO_LARGE', 'حجم عکس زیاد است.')
      }
    }

    // Exact-name duplicate guard — keeps the bank clean (delete + re-add to replace).
    const normName = normalizeFaSearch(body.nameFa)
    const tokens = normName.split(' ').filter((t) => t.length > 1)
    if (tokens.length > 0) {
      const candidates = await db.food.findMany({
        where: { AND: tokens.map((t) => ({ searchText: { contains: t } })) },
        select: { nameFa: true },
      })
      const dup = candidates.find((c) => normalizeFaSearch(c.nameFa) === normName)
      if (dup) {
        throw new ApiError(409, 'DUPLICATE_FOOD', `«${dup.nameFa}» از قبل در بانک غذا هست.`)
      }
    }

    const nameEn = body.nameEn?.trim() || null
    const mealSlots = [...new Set(body.mealSlots ?? [])]
    const food = await db.food.create({
      data: {
        nameFa: body.nameFa,
        nameEn,
        category: body.category,
        foodType: body.foodType,
        isIranian: body.isIranian,
        source: 'USER',
        confidence: 1,
        searchText: normalizeFaSearch(`${body.nameFa} ${nameEn ?? ''}`),
        kcalPer100g: round1(body.per100g.kcal),
        proteinPer100g: round1(body.per100g.protein),
        carbsPer100g: round1(body.per100g.carbs),
        fatPer100g: round1(body.per100g.fat),
        fiberPer100g: body.per100g.fiber != null ? round1(body.per100g.fiber) : null,
        sugarPer100g: body.per100g.sugar != null ? round1(body.per100g.sugar) : null,
        sodiumMgPer100g: body.per100g.sodiumMg != null ? round1(body.per100g.sodiumMg) : null,
        imageUrl: body.imageUrl ?? null,
        budgetLevel: body.budgetLevel ?? null,
        mealSlotsJson: mealSlots.length > 0 ? JSON.stringify(mealSlots) : null,
        isPublic: true, // owner-curated food — visible in search for everyone
        servings: {
          create: body.servings.map((s, i) => ({
            labelFa: s.labelFa,
            unitType: 'CUSTOM',
            grams: s.grams,
            isDefault: i === 0, // first row is the default serving
          })),
        },
      },
      include: { servings: { orderBy: [{ isDefault: 'desc' }, { grams: 'desc' }] } },
    })

    return ok({ food: toAdminDto(food) }, 201)
  } catch (err) {
    return handleError(err)
  }
}

