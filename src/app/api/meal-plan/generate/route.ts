import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ApiError, handleError, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { todayIso } from '@/lib/date'
import { db } from '@/lib/db'
import { awardAchievement, bumpLeaderboard } from '@/lib/gamification'
import { buildPlannerContext, getActivePlanDto, shiftDate } from '@/lib/meal-plan/service'
import { slotsForMealsPerDay } from '@/lib/meal-plan/planner'
import { assembleDayItems } from '@/lib/meal-plan/day'
import {
  buildSlotPools,
  isBudgetLevel,
  loadCuratedPool,
  type CuratedFood,
  type PlanSlot,
} from '@/lib/meal-plan/curated'
import { codeFor, pickWeekWithAi, type AiSlotInput } from '@/lib/ai/plan'
import { MEAL_LABEL } from '@/lib/labels'
import { BUDGET_LABEL } from '@/lib/labels'
import { getScanEntitlement } from '@/lib/entitlements'
import { syncSubscriptionTier } from '@/lib/subscription/service'
import type { BudgetLevel } from '@/lib/nutrition/engine'
import { AiError } from '@/lib/ai/gateway'

const BodySchema = z.object({
  budgetLevel: z.enum(['ECONOMY', 'MID', 'FLEXIBLE']).optional(),
})

/**
 * POST /api/meal-plan/generate — builds a fresh 7-day plan with the AI
 * planner. The model may pick ONLY from the owner-curated option pool
 * (/admin → برنامه: foods tagged with meal slots + budget tier); every
 * kcal/macro number is computed deterministically from per-100g rows here.
 * Budget is hierarchical (آزاد ⊇ متوسط ⊇ اقتصادی). Breakfast/lunch/dinner
 * options are required per budget; snack options are optional. Previous
 * ACTIVE plans are archived (history preserved).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()
    const rl = rateLimit(`plan-gen:${user.id}`, 6, 60_000)
    if (!rl.allowed) throw new ApiError(429, 'RATE_LIMITED', 'کمی صبر کن و دوباره تلاش کن.')

    const body = BodySchema.safeParse(await req.json().catch(() => ({})))
    void req

    await syncSubscriptionTier(user.id)
    const entitlement = await getScanEntitlement(user.id)
    if (!entitlement.canScan && entitlement.reason === 'EXPIRED') {
      throw new ApiError(403, 'SUBSCRIPTION_EXPIRED', 'برای برنامه غذایی، اشتراک را فعال کن.')
    }

    const ctx = await buildPlannerContext(user.id)
    if (!ctx) {
      throw new ApiError(400, 'NOT_ONBOARDED', 'ابتدا رویبردینگ را کامل کن.')
    }

    const budget: BudgetLevel =
      body.success && body.data.budgetLevel
        ? body.data.budgetLevel
        : isBudgetLevel(ctx.budgetLevel)
          ? ctx.budgetLevel
          : 'MID'

    // ─── Curated option pool (the ONLY source the AI may pick from) ───
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

    // ─── AI selection over the closed candidate lists ───
    // Rotate each slot's candidate listing per generation so «برنامه تازه»
    // sees a different ordering (the model tends to favor early codes).
    const existingCount = await db.mealPlan.count({ where: { userId: user.id } })
    const rotation = existingCount * 13 + 7 + Math.floor(Math.random() * 5)

    const aiInputs: AiSlotInput[] = activeSlots
      .filter((s) => slotPools[s.mealType].length > 0)
      .map((s) => {
        const pool = slotPools[s.mealType]
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

    let aiWeek: Awaited<ReturnType<typeof pickWeekWithAi>> | null = null
    try {
      aiWeek = await pickWeekWithAi(aiInputs, ctx.targets, [...ctx.allergies, ...ctx.dislikedFoods])
    } catch (err) {
      // The plan must still materialize from the owner's options even when the
      // model is down — deterministic nearest-kcal fallback inside the same pool.
      console.error('[plan] AI selection failed, using deterministic fallback:', err instanceof AiError ? err.message : err)
      aiWeek = null
    }

    // ─── Assemble 7 days (validated AI picks + deterministic gap-fill) ───
    const recent: string[] = []
    const week: {
      mealType: string
      foodId: string
      titleFa: string
      grams: number
      servingLabel: string
      kcal: number
      proteinG: number
      carbsG: number
      fatG: number
      order: number
    }[][] = []

    for (let d = 0; d < 7; d++) {
      const { items, usedIds } = assembleDayItems({
        slots: activeSlots,
        slotPools,
        curated,
        targetsKcal: ctx.targets.kcal,
        likedFoods: ctx.likedFoods,
        recent,
        seedBase: d,
        aiDay: aiWeek?.[d] ?? null,
      })
      recent.push(...usedIds)
      if (recent.length > 8) recent.splice(0, recent.length - 8)

      // Safety: every required slot must be present every day.
      for (const slot of requiredSlots) {
        if (!items.some((it) => it.mealType === slot.mealType)) {
          throw new ApiError(500, 'PLAN_INCOMPLETE', 'برنامه ناقص ساخته شد. دوباره تلاش کن.')
        }
      }
      week.push(items)
    }

    const startDate = todayIso()
    const endDate = shiftDate(startDate, 6)

    // Archive old, create new — SQLite/prisma nested create keeps it atomic.
    await db.mealPlan.updateMany({ where: { userId: user.id, status: 'ACTIVE' }, data: { status: 'ARCHIVED' } })
    await db.mealPlan.create({
      data: {
        userId: user.id,
        startDate,
        endDate,
        targetsJson: JSON.stringify(ctx.targets),
        budgetLevel: budget,
        source: 'AI',
        days: {
          create: week.map((items, dayIndex) => ({
            date: shiftDate(startDate, dayIndex),
            dayIndex,
            budgetLevel: budget,
            items: {
              create: items.map((it) => ({
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
            },
          })),
        },
      },
    })

    const plan = await getActivePlanDto(user.id)
    if (!plan) throw new ApiError(500, 'INTERNAL', 'ساخت برنامه ناموفق بود.')

    // Gamification hooks — planning is a healthy behavior; never block on it.
    const awards: Awaited<ReturnType<typeof awardAchievement>>[] = []
    try {
      const first = await awardAchievement(user.id, 'FIRST_PLAN')
      if (first) awards.push(first)
      await bumpLeaderboard(user.id, 20)
    } catch (e) {
      console.error('[gamification] plan hook failed:', e)
    }

    return ok({ plan, awards })
  } catch (err) {
    return handleError(err)
  }
}
