import {
  ACTIVITY_FACTORS,
  CALCULATION_ENGINE_VERSION,
  calculateNutritionTargets,
} from './index'
import type {
  ActivityLevel,
  CalculationResult,
  ConfidenceLevel,
  DietTag,
  EnergyCalibrationInput,
  EngineMeasurements,
  EngineWarning,
  Gender,
  GoalType,
} from './types'

/**
 * Fita Nutrition Engine — 100% deterministic, AI-free, testable.
 *
 * This file is the BACKWARD-COMPATIBLE façade (§59): every legacy consumer
 * keeps its exact contract (computeTargets / validateTargetWeight / …) while
 * the math lives in the modular engine v2 under src/lib/nutrition/.
 * Methodology: docs/calculation-methodology.md
 */

export type { Gender, ActivityLevel, GoalType, DietTag } from './types'
export type BudgetLevel = 'ECONOMY' | 'MID' | 'FLEXIBLE'

export { ACTIVITY_FACTORS }

export const ENGINE_METHOD = `nutrition-engine@${CALCULATION_ENGINE_VERSION}`

export interface EngineProfile {
  gender: Gender
  age: number
  heightCm: number
  currentWeightKg: number
  activityLevel: ActivityLevel
  pregnancy: boolean
  breastfeeding: boolean
}

export interface ComputedTargets {
  method: string
  bmr: number
  tdee: number
  kcal: number
  proteinG: number
  carbG: number
  fatG: number
  fiberG: number
  bmi: number
  warnings: string[]
}

/** Optional engine enrichments — existing call sites stay valid without it. */
export interface ComputeOptions {
  measurements?: EngineMeasurements | null
  calibration?: EnergyCalibrationInput | null
  dietTags?: DietTag[]
  paceKgPerWeek?: number | null
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** RMR — Mifflin-St Jeor (1990); kept for legacy direct callers. */
export function calcBmr(input: {
  gender: Gender
  weightKg: number
  heightCm: number
  age: number
}): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age
  return Math.round(input.gender === 'MALE' ? base + 5 : base - 161)
}

/** BMI (kg/m²) — auxiliary indicator only, never a decision-maker alone (§21). */
export function calcBmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100
  return Math.round((weightKg / (m * m)) * 10) / 10
}

/** Legacy warning strings stay UI-stable; codes remain available on the full result. */
function warningStrings(warnings: EngineWarning[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const w of warnings) {
    if (!seen.has(w.messageFa)) {
      seen.add(w.messageFa)
      out.push(w.messageFa)
    }
  }
  return out
}

/**
 * Full target computation — now a thin adapter over engine v2
 * (calculateNutritionTargets). Guarantees unchanged: never below safety
 * floors; no deficit during pregnancy/breastfeeding; deterministic.
 */
export function computeTargets(
  p: EngineProfile,
  goalType: GoalType,
  targetWeightKg?: number | null,
  options?: ComputeOptions,
): ComputedTargets {
  const result = calculateNutritionTargets(
    {
      gender: p.gender,
      age: p.age,
      heightCm: p.heightCm,
      currentWeightKg: p.currentWeightKg,
      activityLevel: p.activityLevel,
      pregnancy: p.pregnancy,
      breastfeeding: p.breastfeeding,
      paceKgPerWeek: options?.paceKgPerWeek ?? null,
      dietTags: options?.dietTags,
      measurements: options?.measurements ?? null,
      calibration: options?.calibration ?? null,
    },
    { goalType, targetWeightKg: targetWeightKg ?? null },
  )
  return {
    method: ENGINE_METHOD,
    bmr: result.rmr,
    tdee: result.estimatedTdee,
    kcal: result.targetCalories,
    proteinG: result.proteinGrams,
    carbG: result.carbohydrateGrams,
    fatG: result.fatGrams,
    fiberG: result.fiberGrams,
    bmi: result.bmi,
    warnings: warningStrings(result.warnings),
  }
}

export interface TargetValidation {
  ok: boolean
  warnings: string[]
}

/**
 * Goal-weight sanity checks (§7/§36/§37): warn on unrealistic, hard-reject on
 * unsafe. Warnings are advisory UI strings; `ok:false` is a hard server rejection.
 */
export function validateTargetWeight(input: {
  gender: Gender
  heightCm: number
  currentWeightKg: number
  targetWeightKg: number
  goalType: GoalType
}): TargetValidation {
  const { heightCm, currentWeightKg, targetWeightKg, goalType } = input
  const warnings: string[] = []
  const deltaKg = targetWeightKg - currentWeightKg
  const bmiTarget = calcBmi(targetWeightKg, heightCm)

  // Hard safety rejections (§35/§36).
  if (bmiTarget < 16.5) {
    return { ok: false, warnings: ['وزن هدف انتخابی خیلی پایین و ناامن است.'] }
  }
  if (deltaKg < 0 && Math.abs(deltaKg) > currentWeightKg * 0.35) {
    return { ok: false, warnings: ['این مقدار کاهش وزن خیلی زیاد است. یک هدف واقعی‌تر انتخاب کن.'] }
  }
  if (deltaKg > currentWeightKg * 0.5) {
    return { ok: false, warnings: ['این مقدار افزایش وزن خیلی زیاد است. یک هدف واقعی‌تر انتخاب کن.'] }
  }
  if (goalType === 'LOSE_WEIGHT' && deltaKg >= 0) {
    return { ok: false, warnings: ['برای هدف «کاهش وزن»، وزن هدف باید کمتر از وزن فعلی باشد.'] }
  }
  if ((goalType === 'GAIN_WEIGHT' || goalType === 'BUILD_MUSCLE') && deltaKg <= 0) {
    return { ok: false, warnings: ['برای این هدف، وزن هدف باید بیشتر از وزن فعلی باشد.'] }
  }

  // Soft advisory warnings.
  if (bmiTarget < 18.5) {
    warnings.push('وزن هدف کمی زیر محدوده سالم (BMI 18.5) قرار می‌گیرد.')
  }
  if (deltaKg < 0 && Math.abs(deltaKg) > currentWeightKg * 0.15) {
    warnings.push('کاهش تدریجی (حدود نیم کیلو در هفته) پایدارترین نتیجه را می‌دهد؛ عجله نکن.')
  }
  if (deltaKg > 0 && deltaKg > currentWeightKg * 0.15) {
    warnings.push('افزایش وزن تدریجی، عضله‌سازی باکیفیت‌تری به همراه دارد.')
  }

  return { ok: true, warnings }
}

/** Suggested goal weight («پیشنهاد فیتا») — conservative starting point, NOT an ideal-weight claim (§20). */
export function suggestTargetWeight(
  currentWeightKg: number,
  goalType: GoalType,
): number | null {
  switch (goalType) {
    case 'LOSE_WEIGHT':
      return Math.max(35, Math.round(currentWeightKg * 0.95))
    case 'GAIN_WEIGHT':
      return Math.round(currentWeightKg * 1.05)
    default:
      return null
  }
}

/** Full v2 result for callers that want confidence/method metadata (§40/§41). */
export type { CalculationResult, ConfidenceLevel, EngineWarning, EnergyCalibrationInput, EngineMeasurements }

/** Exposed so admin/debug tooling can show the active engine version (§58). */
export const ENGINE_VERSION = CALCULATION_ENGINE_VERSION
