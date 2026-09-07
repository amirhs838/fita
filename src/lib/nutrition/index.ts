/**
 * Nutrition Calculation Engine — public surface (engine v2).
 *
 * Deterministic · AI-free · pure (no DB/LLM/network) · version-tagged.
 * Methodology and sources: docs/calculation-methodology.md
 */

export * from './types'
export * from './constants'
export {
  calculateMifflinStJeor,
  calculateCunninghamFfm,
  fatFreeMassKg,
  isPlausibleBodyFat,
  resolveRmr,
} from './rmr'
export {
  calcBmiValue,
  healthyWeightRangeKg,
  estimateBodyFat,
  adjustedBodyWeightKg,
  proteinReferenceWeightKg,
  waistToHeightRatio,
} from './bodyComposition'
export {
  tdeeFromRmr,
  planGoalEnergy,
  recommendedWeeklyLossKg,
  recommendedWeeklyGainKg,
  simulateWeightTrajectory,
} from './energy'
export { proteinTargetG, fatTargetG, carbohydrateTargetG, fiberTargetG } from './macros'
export { resolveSpecialStates } from './specialStates'
export { calibrateEnergyNeeds, trendWeightKg, weeklyTrendKg, confidenceFor } from './calibration'
export { validateEngineInputs } from './validation'
export { calculateNutritionTargets } from './calculate'
