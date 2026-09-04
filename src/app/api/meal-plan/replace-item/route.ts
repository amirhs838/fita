import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ApiError, handleError, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { db } from '@/lib/db'
import { buildPlannerContext } from '@/lib/meal-plan/service'
import {
  buildSlotPools,
  findCuratedSwap,
  isBudgetLevel,
  loadCuratedPool,
} from '@/lib/meal-plan/curated'
import { BUDGET_LABEL, MEAL_LABEL } from '@/lib/labels'
import type { BudgetLevel } from '@/lib/nutrition/engine'

const BodySchema = z.object({ itemId: z.string().min(1) })

/**
 * POST /api/meal-plan/replace-item — swap one planned item for a different
 * food in the same meal slot, chosen ONLY from the owner-curated option pool
 * at the plan's budget tier. Allergies/dislikes are never violated.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()
    const rl = rateLimit(`plan-swap:${user.id}`, 20, 60_000)
    if (!rl.allowed) throw new ApiError(429, 'RATE_LIMITED', 'کمی صبر کن و دوباره تلاش کن.')

    const { itemId } = BodySchema.parse(await req.json())

    const item = await db.mealPlanItem.findUnique({
      where: { id: itemId },
      include: { day: { include: { plan: true } } },
    })
    if (!item || item.day.plan.userId !== user.id) {
      throw new ApiError(404, 'ITEM_NOT_FOUND', 'این مورد در برنامه پیدا نشد.')
    }

    const ctx = await buildPlannerContext(user.id)
    if (!ctx) throw new ApiError(400, 'NOT_ONBOARDED', 'ابتدا رویبردینگ را کامل کن.')

    // Per-day tier wins: a day regenerated at «آزاد» keeps swapping from the
    // آزاد pool even when the plan-level budget is lower.
    const budget: BudgetLevel = isBudgetLevel(item.day.budgetLevel)
      ? item.day.budgetLevel
      : isBudgetLevel(item.day.plan.budgetLevel)
        ? item.day.plan.budgetLevel
        : isBudgetLevel(ctx.budgetLevel)
          ? ctx.budgetLevel
          : 'MID'

    const curated = await loadCuratedPool()
    if (curated.length === 0) {
      throw new ApiError(
        422,
        'PLAN_POOL_EMPTY',
        'هنوز گزینه‌ای برای برنامه‌ساز ثبت نشده است. از پنل مدیریت چند غذا با وعده و بودجه اضافه کن.',
      )
    }

    const slotPools = buildSlotPools(curated, {
      budget,
      allergies: ctx.allergies,
      dislikedFoods: ctx.dislikedFoods,
      dietPreferences: ctx.dietPreferences,
      pregnancy: ctx.pregnancy,
    })

    const siblings = await db.mealPlanItem.findMany({
      where: { dayId: item.dayId, mealType: item.mealType },
      select: { foodId: true },
    })

    const swap = findCuratedSwap(
      slotPools[item.mealType as keyof typeof slotPools] ?? [],
      item.foodId,
      item.kcal,
      siblings.map((s) => s.foodId),
      ctx.likedFoods,
    )
    if (!swap) {
      throw new ApiError(
        422,
        'NO_ALTERNATIVE',
        `گزینه‌ی جایگزین دیگری برای ${MEAL_LABEL[item.mealType] ?? 'این وعده'} در بودجه «${BUDGET_LABEL[budget].title}» ثبت نشده است.`,
      )
    }

    const updated = await db.mealPlanItem.update({
      where: { id: item.id },
      data: {
        foodId: swap.foodId,
        titleFa: swap.titleFa,
        grams: swap.grams,
        servingLabel: swap.servingLabel,
        kcal: swap.kcal,
        proteinG: swap.proteinG,
        carbsG: swap.carbsG,
        fatG: swap.fatG,
        status: 'SWAPPED',
      },
    })

    return ok({
      item: {
        id: updated.id,
        mealType: updated.mealType,
        titleFa: updated.titleFa,
        grams: updated.grams,
        servingLabel: updated.servingLabel,
        kcal: updated.kcal,
        proteinG: updated.proteinG,
        carbsG: updated.carbsG,
        fatG: updated.fatG,
        order: updated.order,
        status: updated.status,
      },
      dayId: item.dayId,
    })
  } catch (err) {
    return handleError(err)
  }
}
