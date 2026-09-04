import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ApiError, handleError, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { db } from '@/lib/db'
import { buildPlannerContext, getActivePlanDto } from '@/lib/meal-plan/service'
import { slotsForMealsPerDay } from '@/lib/meal-plan/planner'
import { assembleDayItems, demoteUsedFirst } from '@/lib/meal-plan/day'
import {
  buildSlotPools,
  loadCuratedPool,
  type CuratedFood,
  type PlanSlot,
} from '@/lib/meal-plan/curated'
import { codeFor, pickWeekWithAi, type AiSlotInput } from '@/lib/ai/plan'
import { BUDGET_LABEL, MEAL_LABEL } from '@/lib/labels'
import { getScanEntitlement } from '@/lib/entitlements'
import { syncSubscriptionTier } from '@/lib/subscription/service'
import type { BudgetLevel } from '@/lib/nutrition/engine'
import { AiError } from '@/lib/ai/gateway'

const BodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  budgetLevel: z.enum(['ECONOMY', 'MID', 'FLEXIBLE']),
})

/**
 * POST /api/meal-plan/regenerate-day — re-chips ONE day of the active weekly
 * plan at a per-day budget tier (اقتصادی / متوسط / آزاد). The plan stays a
 * suggestion engine: the rest of the week is untouched, and the chosen tier
 * is recorded on the day so later swaps inside that day draw from the same
 * pool. AI may pick ONLY from the owner-curated options at the requested
 * tier; kcal/macro numbers stay deterministic.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()
    const rl = rateLimit(`plan-day-gen:${user.id}`, 10, 60_000)
    if (!rl.allowed) throw new ApiError(429, 'RATE_LIMITED', 'کمی صبر کن و دوباره تلاش کن.')

    const body = BodySchema.safeParse(await req.json().catch(() => ({})))
    if (!body.success) throw new ApiError(400, 'BAD_REQUEST', 'روز یا بودجه نامعتبر است.')
    const { date, budgetLevel } = body.data

    await syncSubscriptionTier(user.id)
    const entitlement = await getScanEntitlement(user.id)
    if (!entitlement.canScan && entitlement.reason === 'EXPIRED') {
      throw new ApiError(403, 'SUBSCRIPTION_EXPIRED', 'برای برنامه غذایی، اشتراک را فعال کن.')
    }

    const plan = await db.mealPlan.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
      include: { days: { include: { items: { select: { foodId: true } } } } },
    })
    const day = plan?.days.find((d) => d.date === date)
    if (!plan || !day) {
      throw new ApiError(404, 'DAY_NOT_FOUND', 'برنامه فعالی برای این روز پیدا نشد.')
    }

    const ctx = await buildPlannerContext(user.id)
    if (!ctx) throw new ApiError(400, 'NOT_ONBOARDED', 'ابتدا رویبردینگ را کامل کن.')

    const budget: BudgetLevel = budgetLevel

    const curated = await loadCuratedPool()
    if (curated.length === 0) {
      throw new ApiError(
        422,
        'PLAN_POOL_EMPTY',
        'هنوز هیچ گزینه‌ای برای برنامه‌ساز ثبت نشده است. از پنل مدیریت (/admin) چند غذا با وعده و بودجه اضافه کن.',
      )
    }

    const slotPools = buildSlotPools(curated, {
      budget,
      allergies: ctx.allergies,
      dislikedFoods: ctx.dislikedFoods,
      dietPreferences: ctx.dietPreferences,
      pregnancy: ctx.pregnancy,
    })

    const slots = slotsForMealsPerDay(ctx.mealsPerDay)
    const requiredSlots = slots.filter((s) => s.mealType !== 'SNACK')
    const activeSlots = slots.filter((s) => s.mealType === 'SNACK' || requiredSlots.includes(s))

    for (const slot of requiredSlots) {
      if (slotPools[slot.mealType].length === 0) {
        throw new ApiError(
          422,
          'PLAN_POOL_EMPTY',
          `برای بودجه «${BUDGET_LABEL[budget].title}» هنوز گزینه‌ای برای ${MEAL_LABEL[slot.mealType]} ثبت نشده است. از پنل مدیریت، چند غذا با وعده «${MEAL_LABEL[slot.mealType]}» و این بودجه اضافه کن.`,
        )
      }
    }

    // Foods used on the OTHER days of this plan — softly avoid repeats.
    const usedElsewhere = [
      ...new Set(
        plan.days
          .filter((d) => d.id !== day.id)
          .flatMap((d) => d.items.map((it) => it.foodId))
          .filter((id): id is string => Boolean(id)),
      ),
    ]

    // ─── AI selection for this single day (fresh rotation each call) ───
    const rotation = Math.floor(Math.random() * 97)
    const aiInputs: AiSlotInput[] = activeSlots
      .filter((s) => slotPools[s.mealType].length > 0)
      .map((s) => {
        const pool = demoteUsedFirst(slotPools[s.mealType], usedElsewhere)
        const start = (rotation + s.order * 3) % pool.length
        const rotated = pool.map((_, i) => pool[(i + start) % pool.length])
        return {
          mealType: s.mealType as PlanSlot,
          share: s.share,
          required: s.mealType !== 'SNACK',
          candidates: rotated.map((food: CuratedFood, i: number) => ({
            code: codeFor(s.mealType as PlanSlot, i),
            food,
          })),
        }
      })

    let aiDay: Map<PlanSlot, { foodId: string; grams: number }> | null = null
    try {
      const aiWeek = await pickWeekWithAi(aiInputs, ctx.targets, [...ctx.allergies, ...ctx.dislikedFoods])
      aiDay = aiWeek.find((d) => d !== null) ?? null
    } catch (err) {
      console.error('[plan-day] AI selection failed, using deterministic fallback:', err instanceof AiError ? err.message : err)
      aiDay = null
    }

    const { items } = assembleDayItems({
      slots: activeSlots,
      slotPools,
      curated,
      targetsKcal: ctx.targets.kcal,
      likedFoods: ctx.likedFoods,
      recent: usedElsewhere,
      seedBase: Math.floor(Math.random() * 13),
      aiDay,
    })

    // Safety: every required slot must be present.
    for (const slot of requiredSlots) {
      if (!items.some((it) => it.mealType === slot.mealType)) {
        throw new ApiError(500, 'PLAN_INCOMPLETE', 'چیدن این روز ناقص ماند. دوباره تلاش کن.')
      }
    }

    await db.$transaction([
      db.mealPlanItem.deleteMany({ where: { dayId: day.id } }),
      db.mealPlanItem.createMany({
        data: items.map((it) => ({
          dayId: day.id,
          mealType: it.mealType,
          foodId: it.foodId,
          titleFa: it.titleFa,
          grams: it.grams,
          servingLabel: it.servingLabel,
          kcal: it.kcal,
          proteinG: it.proteinG,
          carbsG: it.carbsG,
          fatG: it.fatG,
          order: it.order,
        })),
      }),
      db.mealPlanDay.update({ where: { id: day.id }, data: { budgetLevel: budget } }),
    ])

    const updated = await getActivePlanDto(user.id)
    if (!updated) throw new ApiError(500, 'INTERNAL', 'به‌روزرسانی برنامه ناموفق بود.')

    return ok({ plan: updated })
  } catch (err) {
    return handleError(err)
  }
}
