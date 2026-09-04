import { db } from '@/lib/db'
import { computeTargets, type ActivityLevel, type Gender, type GoalType } from '@/lib/nutrition/engine'
import type { PlannerContext } from '@/lib/meal-plan/planner'
import { isBudgetLevel } from '@/lib/meal-plan/curated'
import type { AdminBudgetLevel } from '@/lib/types'

/**
 * Shared meal-plan service: assembles the deterministic planner context from
 * the user's live profile/goal/preferences and maps plan rows to DTOs.
 */

export async function buildPlannerContext(userId: string): Promise<PlannerContext | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      allergies: true,
      dislikedFoods: true,
      dietPreferences: true,
    },
  })
  if (!user?.profile?.onboardedAt) return null
  const p = user.profile
  if (!p.gender || !p.birthYear || !p.heightCm || !p.currentWeightKg || !p.activityLevel) return null

  const goal = await db.goal.findFirst({ where: { userId, status: 'ACTIVE' } })
  if (!goal) return null

  const targets = computeTargets(
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

  let likedFoods: string[] = []
  if (p.likedFoodsJson) {
    try {
      const parsed: unknown = JSON.parse(p.likedFoodsJson)
      if (Array.isArray(parsed)) likedFoods = parsed.filter((v): v is string => typeof v === 'string')
    } catch {
      likedFoods = []
    }
  }

  return {
    mealsPerDay: p.mealsPerDay,
    dietPreferences: user.dietPreferences.map((d) => d.tag),
    allergies: user.allergies.map((a) => a.name),
    dislikedFoods: user.dislikedFoods.map((d) => d.name),
    likedFoods,
    budgetLevel: p.budgetLevel,
    pregnancy: p.pregnancy,
    breastfeeding: p.breastfeeding,
    targets,
  }
}

export interface PlanItemDto {
  id: string
  mealType: string
  titleFa: string
  grams: number | null
  servingLabel: string | null
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  order: number
  status: string
}

export interface MealPlanDto {
  id: string
  startDate: string
  endDate: string
  targets: PlannerContext['targets']
  budgetLevel: AdminBudgetLevel | null
  days: { date: string; dayIndex: number; budgetLevel: AdminBudgetLevel | null; items: PlanItemDto[] }[]
}

export async function getActivePlanDto(userId: string): Promise<MealPlanDto | null> {
  const plan = await db.mealPlan.findFirst({
    where: { userId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    include: { days: { orderBy: { dayIndex: 'asc' }, include: { items: { orderBy: { order: 'asc' } } } } },
  })
  if (!plan) return null

  return {
    id: plan.id,
    startDate: plan.startDate,
    endDate: plan.endDate,
    targets: JSON.parse(plan.targetsJson) as PlannerContext['targets'],
    budgetLevel: (isBudgetLevel(plan.budgetLevel) ? plan.budgetLevel : null) as AdminBudgetLevel | null,
    days: plan.days.map((day) => ({
      date: day.date,
      dayIndex: day.dayIndex,
      budgetLevel: (isBudgetLevel(day.budgetLevel) ? day.budgetLevel : null) as AdminBudgetLevel | null,
      items: day.items.map((it) => ({
        id: it.id,
        mealType: it.mealType,
        titleFa: it.titleFa,
        grams: it.grams,
        servingLabel: it.servingLabel,
        kcal: it.kcal,
        proteinG: it.proteinG,
        carbsG: it.carbsG,
        fatG: it.fatG,
        order: it.order,
        status: it.status,
      })),
    })),
  }
}

export function shiftDate(iso: string, deltaDays: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + deltaDays)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
