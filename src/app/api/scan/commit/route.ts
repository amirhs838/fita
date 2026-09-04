import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ApiError, handleError, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { isValidDayKey, todayIso } from '@/lib/date'
import { enDigits } from '@/lib/phone'
import { db } from '@/lib/db'
import { addXp, awardAchievement, bumpLeaderboard, syncStreak } from '@/lib/gamification'

const ItemSchema = z.object({
  foodId: z.string().min(1),
  grams: z.number().min(5).max(3000),
  confidence: z.number().min(0).max(1).nullable().default(null),
})

const BodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(''),
  mealType: z.enum(['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER']),
  items: z.array(ItemSchema).min(1).max(10),
})

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * POST /api/scan/commit — persist the user-corrected scan result as a log.
 * Same deterministic path as /api/diary/log: calories/macros are computed HERE
 * from per-100g DB rows × corrected grams; the AI estimate is only metadata
 * (confidence + provenance) on each FoodLogItem — never the numbers.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()
    const body = BodySchema.parse(await req.json())

    const date = body.date || todayIso()
    if (!isValidDayKey(date)) throw new ApiError(400, 'INVALID_DATE', 'تاریخ نامعتبر است.')

    const foodIds = [...new Set(body.items.map((i) => i.foodId))]
    const foods = await db.food.findMany({
      where: { id: { in: foodIds }, OR: [{ isPublic: true }, { createdByUserId: user.id }] },
    })
    const foodMap = new Map(foods.map((f) => [f.id, f]))

    const rows = body.items.map((item) => {
      const food = foodMap.get(item.foodId)
      if (!food) throw new ApiError(404, 'FOOD_NOT_FOUND', 'غذای انتخاب‌شده پیدا نشد.')

      const k = item.grams / 100
      return {
        foodId: food.id,
        nameFa: food.nameFa,
        grams: item.grams,
        servingLabel: `~${enDigits(Math.round(item.grams))} گرم (تخمین هوشمند)`,
        kcal: round1(food.kcalPer100g * k),
        proteinG: round1(food.proteinPer100g * k),
        carbsG: round1(food.carbsPer100g * k),
        fatG: round1(food.fatPer100g * k),
        fiberG: food.fiberPer100g != null ? round1(food.fiberPer100g * k) : null,
        sugarG: food.sugarPer100g != null ? round1(food.sugarPer100g * k) : null,
        sodiumMg: food.sodiumMgPer100g != null ? round1(food.sodiumMgPer100g * k) : null,
        confidence: item.confidence,
        aiMetaJson: item.confidence !== null
          ? JSON.stringify({ source: 'vision-scan', estimatedGrams: item.grams })
          : null,
      }
    })

    const log = await db.foodLog.create({
      data: {
        userId: user.id,
        date,
        mealType: body.mealType,
        source: 'SCAN',
        items: { create: rows },
      },
      include: { items: true },
    })

    const kcal = log.items.reduce((s, i) => s + i.kcal, 0)

    // Gamification hooks (Phase 9) — never block the commit on errors.
    const awards: Awaited<ReturnType<typeof awardAchievement>>[] = []
    try {
      const first = await awardAchievement(user.id, 'FIRST_SCAN')
      if (first) awards.push(first)
      await addXp(user.id, 3)
      await bumpLeaderboard(user.id, 10)
      awards.push(...(await syncStreak(user.id)))
    } catch (e) {
      console.error('[gamification] scan hook failed:', e)
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
