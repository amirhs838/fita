import { AppConfig } from '@/lib/config'

/**
 * Fita Nutrition Engine — 100% deterministic, AI-free, testable.
 * Method documentation lives inline; version-tagged via `method` on outputs.
 * See ARCHITECTURE.md §3 for the full spec.
 */

export type Gender = 'MALE' | 'FEMALE'
export type ActivityLevel = 'SEDENTARY' | 'LIGHT' | 'MODERATE' | 'ACTIVE' | 'VERY_ACTIVE'
export type GoalType = 'LOSE_WEIGHT' | 'MAINTAIN' | 'GAIN_WEIGHT' | 'BUILD_MUSCLE' | 'RECOMP'
export type BudgetLevel = 'ECONOMY' | 'MID' | 'FLEXIBLE'
export type DietTag =
  | 'NORMAL'
  | 'VEGETARIAN'
  | 'VEGAN'
  | 'KETO'
  | 'HIGH_PROTEIN'
  | 'HALAL'
  | 'LOW_CARB'
  | 'GLUTEN_FREE'

/** Physical activity level multipliers (standard TDEE factors). */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHT: 1.375,
  MODERATE: 1.55,
  ACTIVE: 1.725,
  VERY_ACTIVE: 1.9,
}

/** Protein grams per kg of reference (target) weight, per goal. */
const PROTEIN_G_PER_KG: Record<GoalType, number> = {
  LOSE_WEIGHT: 2.0,
  MAINTAIN: 1.6,
  GAIN_WEIGHT: 1.6,
  BUILD_MUSCLE: 1.9,
  RECOMP: 2.0,
}

/** TDEE adjustment per goal (fraction). */
const GOAL_TDEE_DELTA: Record<GoalType, number> = {
  LOSE_WEIGHT: -0.15,
  MAINTAIN: 0,
  GAIN_WEIGHT: 0.1,
  BUILD_MUSCLE: 0.1,
  RECOMP: -0.05,
}

export const ENGINE_METHOD = 'mifflin-st-jeor@1'

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

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** BMR — Mifflin-St Jeor (1990), the most validated general-population equation. */
export function calcBmr(input: {
  gender: Gender
  weightKg: number
  heightCm: number
  age: number
}): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age
  return Math.round(input.gender === 'MALE' ? base + 5 : base - 161)
}

/** BMI (kg/m²) — auxiliary indicator only, never a decision-maker alone. */
export function calcBmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100
  return Math.round((weightKg / (m * m)) * 10) / 10
}

/** Conservative special-state energy additions (IOM-based, documented in ARCHITECTURE.md). */
function specialStateDelta(p: EngineProfile): { delta: number; warnings: string[] } {
  let delta = 0
  const warnings: string[] = []
  if (p.pregnancy) {
    delta += 340
    warnings.push('در بارداری، توصیه‌های فیتا محافظه‌کارانه است؛ برای تغییر رژیم با پزشکت مشورت کن.')
  }
  if (p.breastfeeding) {
    delta += 500
    warnings.push('در دوره شیردهی به انرژی بیشتری نیاز داری؛ برنامه به‌صورت محافظه‌کارانه تنظیم شده است.')
  }
  return { delta, warnings }
}

/**
 * Full target computation: BMR → TDEE → goal adjustment → safety floors → macros → fiber.
 * Guarantees: never below safety floors; no deficit during pregnancy/breastfeeding.
 */
export function computeTargets(
  p: EngineProfile,
  goalType: GoalType,
  targetWeightKg?: number | null,
): ComputedTargets {
  const warnings: string[] = []

  const bmr = calcBmr({ gender: p.gender, weightKg: p.currentWeightKg, heightCm: p.heightCm, age: p.age })
  const tdee = Math.round(bmr * ACTIVITY_FACTORS[p.activityLevel])

  const special = specialStateDelta(p)
  warnings.push(...special.warnings)

  let delta = GOAL_TDEE_DELTA[goalType]
  // Safety: never run a deficit during pregnancy/breastfeeding.
  if ((p.pregnancy || p.breastfeeding) && delta < 0) {
    delta = 0
    warnings.push('در این شرایط خاص، کاهش کالری توصیه نمی‌شود؛ هدف حفظ سلامت تو است.')
  }

  let kcal = Math.round(tdee * (1 + delta)) + special.delta

  // Hard safety floors.
  const floor =
    p.gender === 'MALE' ? AppConfig.safety.minKcalMale : AppConfig.safety.minKcalFemale
  if (!(p.pregnancy || p.breastfeeding) && kcal < floor) {
    kcal = floor
    warnings.push('برای حفظ سلامتی، کالری روزانه از کف ایمنی پایین‌تر نرفت.')
  }
  if (p.pregnancy || p.breastfeeding) {
    kcal = Math.max(kcal, tdee + special.delta)
  }

  // ── Macros ──
  // Protein: goal-based g/kg on reference (target) weight; capped at 35% of energy.
  const refKg =
    targetWeightKg && targetWeightKg > 0 && Math.abs(targetWeightKg - p.currentWeightKg) < 60
      ? targetWeightKg
      : p.currentWeightKg
  let proteinG = Math.round(refKg * PROTEIN_G_PER_KG[goalType])
  proteinG = Math.min(proteinG, Math.floor((kcal * 0.35) / 4))
  proteinG = clamp(proteinG, Math.round(refKg * 1.2), Math.round(refKg * 2.4))
  proteinG = Math.min(proteinG, Math.floor((kcal * 0.35) / 4))

  // Fat: 27% of energy (min 0.8 g/kg, max 32% of energy).
  let fatG = Math.round((kcal * 0.27) / 9)
  fatG = Math.max(fatG, Math.round(refKg * 0.8))
  fatG = Math.min(fatG, Math.floor((kcal * 0.32) / 9))

  // Carbs: remainder with a 50g floor.
  const carbG = Math.max(50, Math.round((kcal - proteinG * 4 - fatG * 9) / 4))

  // Fiber: 14g per 1000 kcal (IOM), clamped 25–40g.
  const fiberG = clamp(Math.round((kcal / 1000) * 14), 25, 40)

  return {
    method: ENGINE_METHOD,
    bmr,
    tdee,
    kcal,
    proteinG,
    carbG,
    fatG,
    fiberG,
    bmi: calcBmi(p.currentWeightKg, p.heightCm),
    warnings,
  }
}

export interface TargetValidation {
  ok: boolean
  warnings: string[]
}

/**
 * Goal-weight sanity checks (prompt §7): warn on unrealistic, hard-reject on unsafe.
 * Warnings are advisory and shown in UI; `ok:false` is a hard server-side rejection.
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

  // Hard safety rejections.
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

/** Suggested goal weight ("پیشنهاد فیتا") — conservative starting point. */
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
      return null // MAINTAIN/RECOMP/BUILD_MUSCLE: keep current weight as reference
  }
}
