import type { ActivityLevel, DietTag, GoalType } from './types'

/**
 * Engine constants — every number here is documented in
 * docs/calculation-methodology.md with its source. No magic numbers elsewhere.
 */

export const CALCULATION_ENGINE_VERSION = '2.0.0'

/**
 * Energy contained in 1 kg of lost/gained body mass (≈ 3500 kcal/lb).
 * Used ONLY as a step conversion inside the dynamic weekly simulation —
 * never as a stand-alone linear weight-change model (§14).
 */
export const KCAL_PER_KG_BODY_MASS = 7700

/**
 * Physical-activity-level multipliers for TDEE = RMR × PAL.
 * Standard category multipliers used across prediction equations
 * (IOM DRI 2005 activity categories; ADA position on adult weight management).
 * Centralized here — never scattered across the codebase (§11).
 */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHT: 1.375,
  MODERATE: 1.55,
  ACTIVE: 1.725,
  VERY_ACTIVE: 1.9,
}

/** Evidence-based protein ranges in g per kg of reference body weight (§25). */
export const PROTEIN_G_PER_KG: Record<GoalType, number> = {
  LOSE_WEIGHT: 2.0, // energy restriction → lean-mass retention (Helms 2014, Morton 2018)
  MAINTAIN: 1.6,
  GAIN_WEIGHT: 1.7,
  BUILD_MUSCLE: 2.0, // resistance-training goal (Jäger 2017 ISSN)
  RECOMP: 2.2, // simultaneous fat-loss/muscle retention → higher end
  CUSTOM: 1.6,
}

/** Hard clamps on the protein output (g/kg reference weight). */
export const PROTEIN_MIN_G_PER_KG = 1.2
export const PROTEIN_MAX_G_PER_KG = 2.5
/** Protein energy share ceiling for a general consumer product (§25 — no extremes). */
export const PROTEIN_MAX_ENERGY_SHARE = 0.35

/**
 * Fat distribution: 27% of energy is mid-range of the AMDR 20–35% (IOM DRI 2005).
 * Floors/caps keep fat from being pushed artificially low or high (§27).
 */
export const FAT_ENERGY_SHARE_BASE = 0.27
export const FAT_ENERGY_SHARE_MIN = 0.2
export const FAT_ENERGY_SHARE_MAX = 0.35
export const FAT_MIN_G_PER_KG_REF = 0.8

/** Diet-style fat/carb redistribution (calorie target is untouched). */
export const DIET_FAT_SHARE: Partial<Record<DietTag, number>> = {
  KETO: 0.65,
  LOW_CARB: 0.4,
  HIGH_PROTEIN: 0.25,
}
export const CARB_FLOOR_G_NORMAL = 80
export const CARB_FLOOR_G_LOW_CARB = 50
export const CARB_CAP_G_KETO = 50
export const CARB_FLOOR_G_KETO = 25

/** Fiber ≈ 14 g per 1000 kcal (IOM DRI 2005), practical clamps (§30). */
export const FIBER_G_PER_1000_KCAL = 14
export const FIBER_MIN_G = 25
export const FIBER_MAX_G = 40

/** Adult BMI reference band used ONLY as a screening range (§20/§21). */
export const HEALTHY_BMI_MIN = 18.5
export const HEALTHY_BMI_MAX = 24.9

/**
 * Safe weekly weight-change rates (§15/§16): fractions of current body weight,
 * further bounded by AppConfig.safety maxWeeklyLossKg / maxWeeklyGainKg.
 */
export const LOSS_RATE_MIN_BW = 0.0025
export const LOSS_RATE_RECOMMENDED_BW = 0.005
export const LOSS_RATE_BW_BMI_30 = 0.0075
export const LOSS_RATE_MAX_BW = 0.01
export const GAIN_RATE_RECOMMENDED_BW = 0.0025
export const GAIN_RATE_MAX_BW = 0.005
/** Energy-difference caps relative to TDEE (never extreme deficits/surpluses, §35). */
export const MAX_DEFICIT_ENERGY_SHARE = 0.25
export const MAX_DEFICIT_ABSOLUTE_KCAL = 1000
export const MAX_SURPLUS_SHARE_BUILD = 0.15
export const MAX_SURPLUS_ABSOLUTE_BUILD = 400
export const MAX_SURPLUS_SHARE_GAIN = 0.2
export const MAX_SURPLUS_ABSOLUTE_GAIN = 500

/** Trend-calibration guardrails (§13): hysteresis + bounded adjustment. */
export const CALIBRATION_MIN_LOGGED_DAYS = 10
export const CALIBRATION_HYSTERESIS_KCAL = 75
export const CALIBRATION_MAX_ADJUSTMENT_KCAL = 150

/** Simulation horizon for goal timeline (§37): beyond this the goal is flagged long. */
export const SIMULATION_MAX_WEEKS = 104
export const GOAL_TIMELINE_WARN_WEEKS = 52
/** Weight change considered "reached" in the simulation (kg). */
export const SIMULATION_TOLERANCE_KG = 0.3

/** Gestational weight-gain guidance by pre-pregnancy BMI (IOM/NRC 2009), total kg. */
export const PREGNANCY_GWG_BY_BMI = [
  { maxBmi: 18.5, minKg: 12.5, maxKg: 18 },
  { maxBmi: 25, minKg: 11.5, maxKg: 16 },
  { maxBmi: 30, minKg: 7, maxKg: 11.5 },
  { maxBmi: Infinity, minKg: 5, maxKg: 9 },
] as const

/** Special-state energy additions (IOM 2005/2009) — see methodology doc. */
export const PREGNANCY_ENERGY_DELTA_KCAL = 340 // 2nd-trimester default (1st: +0, 3rd: +452)
export const BREASTFEEDING_ENERGY_DELTA_KCAL = 330 // 0–6 months, mixed/exclusive default

/** Plausibility bands for validation (§43) — impossible values are rejected upstream. */
export const AGE_MIN = 10
export const AGE_MAX = 100
export const HEIGHT_MIN_CM = 80
export const HEIGHT_MAX_CM = 250
export const WEIGHT_MIN_KG = 25
export const WEIGHT_MAX_KG = 400
export const WAIST_MIN_CM = 20
export const WAIST_MAX_CM = 200
/** Valid body-fat bands — outside these the FFM path is ignored (§10). */
export const BODYFAT_VALID_MALE = { min: 5, max: 55 }
export const BODYFAT_VALID_FEMALE = { min: 10, max: 60 }
/** Above this BMI, protein uses adjusted body weight instead of actual weight (§26). */
export const ADJUSTED_WEIGHT_BMI_THRESHOLD = 30
