/**
 * Nutrition Calculation Engine — types (engine v2).
 *
 * Contracts are additive: the legacy ComputedTargets shape in engine.ts is an
 * adapter over the full result, so existing consumers never break.
 */

export type Gender = 'MALE' | 'FEMALE'
export type ActivityLevel = 'SEDENTARY' | 'LIGHT' | 'MODERATE' | 'ACTIVE' | 'VERY_ACTIVE'
/** Goal scenarios the engine strategies support (§38). CUSTOM maps to the closest strategy. */
export type GoalType = 'LOSE_WEIGHT' | 'MAINTAIN' | 'GAIN_WEIGHT' | 'BUILD_MUSCLE' | 'RECOMP' | 'CUSTOM'
export type DietTag =
  | 'NORMAL' | 'VEGETARIAN' | 'VEGAN' | 'KETO' | 'HIGH_PROTEIN' | 'HALAL' | 'LOW_CARB' | 'GLUTEN_FREE'

/** Structured safety/context warnings (§66) — UI renders messageFa, code stays machine-readable. */
export type WarningCode =
  | 'AGE_TOO_LOW'
  | 'AGE_TOO_HIGH'
  | 'INVALID_HEIGHT'
  | 'INVALID_WEIGHT'
  | 'INVALID_BODY_COMPOSITION'
  | 'INVALID_WAIST'
  | 'GOAL_WEIGHT_UNREALISTIC'
  | 'GOAL_RATE_TOO_FAST'
  | 'GOAL_WEIGHT_MISMATCH'
  | 'CALORIE_TARGET_TOO_LOW'
  | 'CALORIE_DEFICIT_CAPPED'
  | 'PREGNANCY_WEIGHT_LOSS_NOT_ALLOWED'
  | 'BREASTFEEDING_AGGRESSIVE_DEFICIT'
  | 'UNREALISTIC_TIMELINE'
  | 'GOAL_TIMELINE_LONG'
  | 'CALIBRATION_DATA_INSUFFICIENT'
  | 'CARB_FLOOR_APPLIED'
  | 'SPECIAL_STATE_CONSULT_DOCTOR'
  | 'ESTIMATE_NOT_MEASUREMENT'

export interface EngineWarning {
  code: WarningCode
  messageFa: string
}

export type ConfidenceLevel = 'LOW' | 'MODERATE' | 'HIGH'

/** RMR method actually used (§41 calculation method metadata). */
export type RmrMethod = 'Mifflin-St Jeor' | 'Body Composition + FFM'

/** Optional circumference inputs — used only where scientifically justified (§22). */
export interface EngineMeasurements {
  waistCm?: number | null
  hipCm?: number | null
  neckCm?: number | null
}

/** Trend-calibration payload (§13) — produced by the caller from DB history, never by the engine. */
export interface EnergyCalibrationInput {
  /** kg/week observed trend (negative = losing). Caller computes from ≥14 days of weights. */
  observedWeeklyChangeKg: number
  /** Average logged intake (kcal/day) over the observation window. */
  observedIntakeKcal: number
  /** Distinct logged days in the window (adherence gate). */
  loggedDays: number
}

export interface EngineInput {
  gender: Gender
  age: number
  heightCm: number
  currentWeightKg: number
  activityLevel: ActivityLevel
  pregnancy: boolean
  breastfeeding: boolean
  /** User-suggested weekly pace (signed kg/week) — clamped by safety rules when provided. */
  paceKgPerWeek?: number | null
  /** Diet style shifts the fat/carb split only (never the calorie target). */
  dietTags?: DietTag[]
  measurements?: EngineMeasurements | null
  calibration?: EnergyCalibrationInput | null
}

/** What the engine should compute toward (validated upstream). */
export interface GoalInput {
  goalType: GoalType
  targetWeightKg?: number | null
}

/** Body-composition context derived inside the engine (§21/§22/§23). */
export interface BodyCompositionContext {
  bmi: number
  healthyWeightRange: { minKg: number; maxKg: number }
  bodyFatPct: number | null
  bodyFatMethod: 'NAVY' | 'RFM' | null
  fatMassKg: number | null
  fatFreeMassKg: number | null
  waistToHeightRatio: number | null
  adjustedBodyWeightKg: number
  proteinReferenceWeightKg: number
}

/** Full deterministic result (§40 output contract). */
export interface CalculationResult {
  engineVersion: string
  calculationMethod: RmrMethod
  dataCompleteness: {
    hasBodyFatEstimate: boolean
    hasWaist: boolean
    hasWeightTrend: boolean
    calibrationApplied: boolean
  }
  confidence: ConfidenceLevel

  rmr: number
  estimatedTdee: number
  maintenanceCalories: number
  targetCalories: number
  calorieAdjustment: number
  calibrationAdjustmentKcal: number

  proteinGrams: number
  carbohydrateGrams: number
  fatGrams: number
  fiberGrams: number

  bmi: number
  healthyWeightRange: { minKg: number; maxKg: number }
  currentWeightKg: number
  targetWeightKg: number | null

  /** Recommended safe pace for this context (signed, kg/week). */
  recommendedWeeklyChangeKg: number | null
  /** Average weekly change over the first 4 simulated weeks (signed, kg/week). */
  expectedWeeklyWeightChange: number | null
  /** Simulated date the target weight is reached (null when > 52 weeks or not applicable). */
  estimatedGoalDate: string | null
  weeksToGoal: number | null

  /** Gestational weight-gain guidance, pregnancy only (IOM 2009, total kg). */
  gestationalWeightGainRangeKg: { min: number; max: number } | null

  bodyComposition: BodyCompositionContext
  warnings: EngineWarning[]
  limitations: string[]
}
