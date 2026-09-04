import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ApiError, handleError, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { isValidDayKey } from '@/lib/date'
import { computeTargets, type ActivityLevel, type ComputedTargets, type Gender, type GoalType } from '@/lib/nutrition/engine'
import { db } from '@/lib/db'

const QuerySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })

/**
 * GET /api/summary?date=YYYY-MM-DD
 * Daily dashboard backbone: engine-fresh targets + consumed totals + water.
 * Consumed stays zero until food logging lands (Phase 4).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser()
    const parsed = QuerySchema.safeParse({ date: req.nextUrl.searchParams.get('date') ?? '' })
    if (!parsed.success) throw new ApiError(400, 'INVALID_DATE', 'تاریخ نامعتبر است.')
    const date = parsed.data.date
    if (!isValidDayKey(date)) throw new ApiError(400, 'INVALID_DATE', 'تاریخ نامعتبر است.')

    const p = user.profile
    const goal =
      p?.onboardedAt
        ? await db.goal.findFirst({ where: { userId: user.id, status: 'ACTIVE' } })
        : null

    let targets: ComputedTargets | null = null
    if (p && goal && p.gender && p.birthYear && p.heightCm && p.currentWeightKg && p.activityLevel) {
      targets = computeTargets(
        {
          gender: p.gender as Gender,
          age: new Date().getFullYear() - p.birthYear,
          heightCm: p.heightCm,
          currentWeightKg: p.currentWeightKg,
          activityLevel: p.activityLevel as ActivityLevel,
          pregnancy: p.pregnancy,
          breastfeeding: p.breastfeeding,
        },
        goal.type as GoalType,
        goal.targetWeightKg,
      )
    }

    const logs = await db.foodLog.findMany({
      where: { userId: user.id, date },
      include: { items: true },
    })
    const consumed = logs
      .flatMap((l) => l.items)
      .reduce(
        (acc, it) => ({
          kcal: acc.kcal + it.kcal,
          proteinG: acc.proteinG + it.proteinG,
          carbG: acc.carbG + it.carbsG,
          fatG: acc.fatG + it.fatG,
          fiberG: acc.fiberG + (it.fiberG ?? 0),
        }),
        { kcal: 0, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0 },
      )

    const water = await db.waterLog.aggregate({
      where: { userId: user.id, date },
      _sum: { amountMl: true },
    })

    return ok({
      date,
      targets,
      consumed: {
        kcal: Math.round(consumed.kcal),
        proteinG: Math.round(consumed.proteinG),
        carbG: Math.round(consumed.carbG),
        fatG: Math.round(consumed.fatG),
        fiberG: Math.round(consumed.fiberG),
      },
      waterMl: water._sum.amountMl ?? 0,
      loggedMeals: new Set(logs.map((l) => l.mealType)).size,
    })
  } catch (err) {
    return handleError(err)
  }
}
