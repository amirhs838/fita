import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ApiError, handleError, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { isValidDayKey, todayIso } from '@/lib/date'
import { enDigits } from '@/lib/phone'
import { db } from '@/lib/db'
import { addXp, awardAchievement, bumpLeaderboard, syncStreak } from '@/lib/gamification'

const ItemSchema = z
  .object({
    foodId: z.string().min(1),
    servingId: z.string().min(1).optional(),
    grams: z.number().positive().max(3000).optional(),
    quantity: z.number().positive().max(50).default(1),
  })
  .refine((v) => Boolean(v.servingId || v.grams), {
    message: 'either servingId or grams is required',
  })

const BodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(''),
  mealType: z.enum(['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER']),
  items: z.array(ItemSchema).min(1).max(10),
})

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * POST /api/diary/log
 * Deterministic logging: macros are computed HERE from the per-100g reference
 * and snapshotted into FoodLogItem. The LLM (future scan flow) only proposes
 * food + grams; numbers on the record always come from this code path.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()

    const rl = rateLimit(`diary-log:${user.id}`, 60, 60_000)
    if (!rl.allowed) {
      throw new ApiError(429, 'RATE_LIMITED', `درخواست‌های مکرر. ${rl.retryAfterSec} ثانیه دیگر تلاش کن.`)
    }

    const body = BodySchema.parse(await req.json())

    const date = body.date || todayIso()
    if (!isValidDayKey(date)) throw new ApiError(400, 'INVALID_DATE', 'تاریخ نامعتبر است.')

    // Resolve foods + servings once; SQLite has no `findMany` nested include constraint issues here.
    const foodIds = [...new Set(body.items.map((i) => i.foodId))]
    const servingIds = body.items
      .map((i) => i.servingId)
      .filter((v): v is string => typeof v === 'string')

    const foods = await db.food.findMany({
      where: { id: { in: foodIds }, OR: [{ isPublic: true }, { createdByUserId: user.id }] },
      include: { servings: true },
    })
    const servings = servingIds.length
      ? await db.foodServing.findMany({ where: { id: { in: servingIds } } })
      : []

    const foodMap = new Map(foods.map((f) => [f.id, f]))
    const servingMap = new Map(servings.map((s) => [s.id, s]))

    const rows = body.items.map((item) => {
      const food = foodMap.get(item.foodId)
      if (!food) throw new ApiError(404, 'FOOD_NOT_FOUND', 'غذای انتخاب‌شده پیدا نشد.')

      let grams: number
      let servingLabel: string | null = null
      if (item.servingId) {
        const serving = servingMap.get(item.servingId)
        if (!serving || serving.foodId !== food.id) {
          throw new ApiError(422, 'INVALID_SERVING', 'واحد انتخابی برای این غذا معتبر نیست.')
        }
        grams = serving.grams * item.quantity
        servingLabel =
          item.quantity === 1
            ? `${serving.labelFa} (~${enDigits(Math.round(serving.grams))} گرم)`
            : `${serving.labelFa} × ${enDigits(String(item.quantity))} (~${enDigits(Math.round(grams))} گرم)`
      } else {
        grams = item.grams as number
        servingLabel = `${enDigits(Math.round(grams))} گرم`
      }

      const k = grams / 100
      return {
        foodId: food.id,
        nameFa: food.nameFa,
        grams,
        servingLabel,
        kcal: round1(food.kcalPer100g * k),
        proteinG: round1(food.proteinPer100g * k),
        carbsG: round1(food.carbsPer100g * k),
        fatG: round1(food.fatPer100g * k),
        fiberG: food.fiberPer100g != null ? round1(food.fiberPer100g * k) : null,
        sugarG: food.sugarPer100g != null ? round1(food.sugarPer100g * k) : null,
        sodiumMg: food.sodiumMgPer100g != null ? round1(food.sodiumMgPer100g * k) : null,
      }
    })

    const log = await db.foodLog.create({
      data: {
        userId: user.id,
        date,
        mealType: body.mealType,
        source: 'SEARCH',
        items: { create: rows },
      },
      include: { items: true },
    })

    const kcal = log.items.reduce((s, i) => s + i.kcal, 0)

    // Gamification hooks (Phase 9) — never block the log on errors.
    const awards: Awaited<ReturnType<typeof awardAchievement>>[] = []
    try {
      const first = await awardAchievement(user.id, 'FIRST_MEAL')
      if (first) awards.push(first)
      await addXp(user.id, 2)
      await bumpLeaderboard(user.id, 5)
      awards.push(...(await syncStreak(user.id)))
    } catch (e) {
      console.error('[gamification] diary hook failed:', e)
    }

    return ok({
      logId: log.id,
      date,
      mealType: log.mealType,
      itemCount: log.items.length,
      kcal: Math.round(kcal),
      awards,
    })
  } catch (err) {
    return handleError(err)
  }
}
