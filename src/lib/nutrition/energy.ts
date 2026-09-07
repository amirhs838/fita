import { AppConfig } from '@/lib/config'
import {
  GAIN_RATE_MAX_BW,
  GAIN_RATE_RECOMMENDED_BW,
  GOAL_TIMELINE_WARN_WEEKS,
  KCAL_PER_KG_BODY_MASS,
  LOSS_RATE_BW_BMI_30,
  LOSS_RATE_MAX_BW,
  LOSS_RATE_MIN_BW,
  LOSS_RATE_RECOMMENDED_BW,
  MAX_DEFICIT_ABSOLUTE_KCAL,
  MAX_DEFICIT_ENERGY_SHARE,
  MAX_SURPLUS_ABSOLUTE_BUILD,
  MAX_SURPLUS_ABSOLUTE_GAIN,
  MAX_SURPLUS_SHARE_BUILD,
  MAX_SURPLUS_SHARE_GAIN,
  SIMULATION_MAX_WEEKS,
  SIMULATION_TOLERANCE_KG,
} from './constants'
import { calcBmiValue } from './bodyComposition'
import { calculateMifflinStJeor } from './rmr'
import type { EngineInput, GoalInput } from './types'

/**
 * Energy model (§11–§19): centralized activity model → TDEE → goal strategy →
 * safety caps. Exercise is NEVER added on top (§12) — activity is already
 * inside the PAL multiplier, so workout/steps calories must not be double-counted.
 */

export function tdeeFromRmr(rmr: number, activityFactor: number): number {
  return rmr * activityFactor
}

export interface GoalEnergyPlan {
  /** Signed weekly change this plan produces (kg/week). */
  weeklyChangeKg: number
  /** Signed daily energy adjustment vs maintenance (kcal). */
  calorieAdjustment: number
  targetCaloriesBeforeSpecialStates: number
  /** True when the user's requested pace had to be clamped for safety. */
  paceClamped: boolean
}

/**
 * Recommended safe pace for the person's context (§15): a fraction of current
 * body weight, tighter for higher body fat (BMI), hard-bounded by AppConfig.
 */
export function recommendedWeeklyLossKg(currentWeightKg: number, heightCm: number): number {
  const bmi = calcBmiValue(currentWeightKg, heightCm)
  const rateBw = bmi >= 35 ? LOSS_RATE_MAX_BW : bmi >= 30 ? LOSS_RATE_BW_BMI_30 : LOSS_RATE_RECOMMENDED_BW
  return Math.min(rateBw * currentWeightKg, AppConfig.safety.maxWeeklyLossKg)
}

export function recommendedWeeklyGainKg(currentWeightKg: number): number {
  return Math.min(GAIN_RATE_RECOMMENDED_BW * currentWeightKg, AppConfig.safety.maxWeeklyGainKg)
}

function clampLossPace(paceKg: number, currentWeightKg: number): number {
  const maxByBw = LOSS_RATE_MAX_BW * currentWeightKg
  const max = Math.min(maxByBw, AppConfig.safety.maxWeeklyLossKg)
  const min = LOSS_RATE_MIN_BW * currentWeightKg
  return Math.min(Math.max(paceKg, min), max)
}

function clampGainPace(paceKg: number, currentWeightKg: number): number {
  const max = Math.min(GAIN_RATE_MAX_BW * currentWeightKg, AppConfig.safety.maxWeeklyGainKg)
  const min = GAIN_RATE_RECOMMENDED_BW * currentWeightKg * 0.5
  return Math.min(Math.max(paceKg, min), max)
}

/**
 * Deficit with layered caps (§35): pace-derived → energy-share cap → absolute
 * cap → hard calorie floor applied later. Gradual beats aggressive (§15).
 */
function deficitFromPace(paceKgPerWeek: number): number {
  return (paceKgPerWeek * KCAL_PER_KG_BODY_MASS) / 7
}

function capDeficit(rawDeficit: number, tdeeValue: number): { deficit: number; capped: boolean } {
  const shareCap = tdeeValue * MAX_DEFICIT_ENERGY_SHARE
  const cap = Math.min(shareCap, MAX_DEFICIT_ABSOLUTE_KCAL)
  if (rawDeficit > cap) return { deficit: cap, capped: true }
  return { deficit: rawDeficit, capped: false }
}

/**
 * Map the goal scenario to a deterministic energy plan (§38 — different goals,
 * different strategies; §39 — CUSTOM maps to the closest supported strategy).
 */
export function planGoalEnergy(
  input: EngineInput,
  goal: GoalInput,
  tdeeValue: number,
): GoalEnergyPlan {
  const w = input.currentWeightKg
  const bmi = calcBmiValue(w, input.heightCm)
  const deltaKg = goal.targetWeightKg != null ? goal.targetWeightKg - w : null

  switch (goal.goalType) {
    case 'MAINTAIN':
      return { weeklyChangeKg: 0, calorieAdjustment: 0, targetCaloriesBeforeSpecialStates: tdeeValue, paceClamped: false }

    case 'LOSE_WEIGHT':
    case 'CUSTOM': {
      // CUSTOM with no explicit direction → maintenance.
      if (goal.goalType === 'CUSTOM' && (deltaKg == null || Math.abs(deltaKg) < 0.5)) {
        return { weeklyChangeKg: 0, calorieAdjustment: 0, targetCaloriesBeforeSpecialStates: tdeeValue, paceClamped: false }
      }
      const losing = goal.goalType === 'LOSE_WEIGHT' || (deltaKg ?? 0) < 0
      if (!losing) {
        return planGain(w, tdeeValue, input.paceKgPerWeek ?? null, 'GAIN_WEIGHT')
      }
      const recommended = recommendedWeeklyLossKg(w, input.heightCm)
      const userPace = input.paceKgPerWeek != null && input.paceKgPerWeek < 0 ? Math.abs(input.paceKgPerWeek) : null
      const pace = userPace != null ? clampLossPace(userPace, w) : recommended
      const { deficit, capped } = capDeficit(deficitFromPace(pace), tdeeValue)
      return {
        weeklyChangeKg: -(deficit * 7) / KCAL_PER_KG_BODY_MASS,
        calorieAdjustment: -deficit,
        targetCaloriesBeforeSpecialStates: tdeeValue - deficit,
        paceClamped: capped || (userPace != null && userPace > recommended * 1.34),
      }
    }

    case 'GAIN_WEIGHT':
    case 'BUILD_MUSCLE':
      return planGain(w, tdeeValue, input.paceKgPerWeek ?? null, goal.goalType)

    case 'RECOMP': {
      // Near-maintenance; a modest deficit only when body-fat context suggests it (§19).
      const deficit = bmi >= 25 ? tdeeValue * 0.1 : 0
      return {
        weeklyChangeKg: -(deficit * 7) / KCAL_PER_KG_BODY_MASS,
        calorieAdjustment: -deficit,
        targetCaloriesBeforeSpecialStates: tdeeValue - deficit,
        paceClamped: false,
      }
    }
  }
}

function planGain(
  weightKg: number,
  tdeeValue: number,
  paceKgPerWeek: number | null,
  goalType: 'GAIN_WEIGHT' | 'BUILD_MUSCLE',
): GoalEnergyPlan {
  const recommended = recommendedWeeklyGainKg(weightKg)
  const pace =
    goalType === 'BUILD_MUSCLE'
      ? Math.min(GAIN_RATE_RECOMMENDED_BW * weightKg, recommended) // modest muscle-build surplus (§18)
      : paceKgPerWeek != null && paceKgPerWeek > 0
        ? clampGainPace(paceKgPerWeek, weightKg)
        : recommended
  const rawSurplus = deficitFromPace(pace)
  const shareCap = goalType === 'BUILD_MUSCLE' ? MAX_SURPLUS_SHARE_BUILD : MAX_SURPLUS_SHARE_GAIN
  const absoluteCap = goalType === 'BUILD_MUSCLE' ? MAX_SURPLUS_ABSOLUTE_BUILD : MAX_SURPLUS_ABSOLUTE_GAIN
  const surplus = Math.min(rawSurplus, tdeeValue * shareCap, absoluteCap)
  return {
    weeklyChangeKg: (surplus * 7) / KCAL_PER_KG_BODY_MASS,
    calorieAdjustment: surplus,
    targetCaloriesBeforeSpecialStates: tdeeValue + surplus,
    paceClamped: rawSurplus > surplus + 1,
  }
}

export interface WeeklySimulation {
  /** Average weekly change across the first 4 weeks (kg, signed). */
  initialWeeklyChangeKg: number
  weeksToGoal: number | null
  /** Trajectory crossed the safe horizon — goal is plausible but slow. */
  exceedsHorizon: boolean
}

/**
 * Dynamic weight-change model (§14): each simulated week recomputes TDEE at
 * the new body mass (Mifflin–St Jeor for trajectory stability), so the fixed
 * deficit naturally shrinks as weight changes — no linear-forever assumption.
 */
export function simulateWeightTrajectory(input: {
  gender: EngineInput['gender']
  age: number
  heightCm: number
  startWeightKg: number
  activityFactor: number
  targetCalories: number
  goalWeightKg: number | null
}): WeeklySimulation {
  const weeklyDelta = (targetCal: number, weightKg: number) =>
    ((targetCal - calculateMifflinStJeor({ gender: input.gender, weightKg, heightCm: input.heightCm, age: input.age }) * input.activityFactor) * 7) / KCAL_PER_KG_BODY_MASS

  let weight = input.startWeightKg
  let first4 = 0
  let weeksToGoal: number | null = null
  const direction = input.goalWeightKg == null ? 0 : Math.sign(input.goalWeightKg - input.startWeightKg)

  for (let week = 1; week <= SIMULATION_MAX_WEEKS; week++) {
    const delta = weeklyDelta(input.targetCalories, weight)
    if (week <= 4) first4 += delta
    const prev = weight
    weight += delta
    if (weeksToGoal == null && direction !== 0) {
      const crossed = direction > 0 ? weight >= input.goalWeightKg! - SIMULATION_TOLERANCE_KG : weight <= input.goalWeightKg! + SIMULATION_TOLERANCE_KG
      if (crossed || (direction > 0 && weight < prev) || (direction < 0 && weight > prev)) {
        weeksToGoal = week // plateaued short of target — stop claiming progress
      }
    }
  }
  if (weeksToGoal == null && input.goalWeightKg != null) {
    const remaining = Math.abs(input.goalWeightKg - weight)
    if (remaining > 1) weeksToGoal = null
  }

  return {
    initialWeeklyChangeKg: first4 / 4,
    weeksToGoal,
    exceedsHorizon: weeksToGoal != null && weeksToGoal > GOAL_TIMELINE_WARN_WEEKS,
  }
}
