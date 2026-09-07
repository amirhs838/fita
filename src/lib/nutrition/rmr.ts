import { BODYFAT_VALID_FEMALE, BODYFAT_VALID_MALE } from './constants'
import type { EngineMeasurements, Gender, RmrMethod } from './types'

/**
 * RMR calculation — LEVEL 1 / LEVEL 2 of the calculation hierarchy (§8/§9/§10).
 * Pure functions only; validated elsewhere. All outputs are estimates.
 */

export interface MifflinStJeorInput {
  gender: Gender
  weightKg: number
  heightCm: number
  age: number
}

/**
 * LEVEL 1 — Mifflin–St Jeor (1990, Am J Clin Nutr 51:241-7).
 * The American Dietetic Association position: most reliable predictor of RMR
 * for normal-weight and overweight adults when direct measurement is absent.
 */
export function calculateMifflinStJeor(input: MifflinStJeorInput): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age
  return input.gender === 'MALE' ? base + 5 : base - 161
}

/**
 * LEVEL 2 — Cunningham-type FFM equation: RMR = 500 + 22 × FFM.
 * Body-composition-aware; validated for lean/active adults where FFM dominates
 * resting energy needs. ONLY used when body fat is plausible for the person.
 */
export function calculateCunninghamFfm(fatFreeMassKg: number): number {
  return 500 + 22 * fatFreeMassKg
}

/** Fat-free mass from a body-fat percentage in [0,100]. */
export function fatFreeMassKg(weightKg: number, bodyFatPct: number): number {
  return weightKg * (1 - bodyFatPct / 100)
}

/**
 * Decide whether an estimated body-fat percentage is plausible enough to drive
 * the FFM path (§10: "do not let bad body-fat input corrupt the calculation").
 * Circumference estimators are already clamped; these wider bands catch nonsense.
 */
export function isPlausibleBodyFat(gender: Gender, bodyFatPct: number | null | undefined): boolean {
  if (bodyFatPct == null || !Number.isFinite(bodyFatPct)) return false
  const band = gender === 'MALE' ? BODYFAT_VALID_MALE : BODYFAT_VALID_FEMALE
  return bodyFatPct >= band.min && bodyFatPct <= band.max
}

export interface RmrResolution {
  rmr: number
  method: RmrMethod
  bodyFatPct: number | null
  bodyFatMethod: 'NAVY' | 'RFM' | null
  fatFreeMassKg: number | null
}

/**
 * Resolve RMR with the best-supported method for the available inputs (§44):
 * valid body-fat estimate → FFM path; anything missing/implausible → MSJ.
 */
export function resolveRmr(input: {
  gender: Gender
  age: number
  heightCm: number
  weightKg: number
  bodyFatPct: number | null
  bodyFatMethod: 'NAVY' | 'RFM' | null
}): RmrResolution {
  if (isPlausibleBodyFat(input.gender, input.bodyFatPct) && input.bodyFatPct != null) {
    const ffm = fatFreeMassKg(input.weightKg, input.bodyFatPct)
    return {
      rmr: calculateCunninghamFfm(ffm),
      method: 'Body Composition + FFM',
      bodyFatPct: input.bodyFatPct,
      bodyFatMethod: input.bodyFatMethod,
      fatFreeMassKg: ffm,
    }
  }
  return {
    rmr: calculateMifflinStJeor({
      gender: input.gender,
      weightKg: input.weightKg,
      heightCm: input.heightCm,
      age: input.age,
    }),
    method: 'Mifflin-St Jeor',
    bodyFatPct: null,
    bodyFatMethod: null,
    fatFreeMassKg: null,
  }
}

/** Guard so measurement-type callers can't leak NaN into the engine. */
export function sanitizeMeasurements(m?: EngineMeasurements | null): EngineMeasurements | null {
  if (!m) return null
  const clean: EngineMeasurements = {}
  for (const key of ['waistCm', 'hipCm', 'neckCm'] as const) {
    const v = m[key]
    clean[key] = v != null && Number.isFinite(v) && v > 0 ? v : null
  }
  return clean
}
