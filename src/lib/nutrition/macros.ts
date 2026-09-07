import {
  CARB_CAP_G_KETO,
  CARB_FLOOR_G_KETO,
  CARB_FLOOR_G_LOW_CARB,
  CARB_FLOOR_G_NORMAL,
  DIET_FAT_SHARE,
  FAT_ENERGY_SHARE_BASE,
  FAT_ENERGY_SHARE_MAX,
  FAT_ENERGY_SHARE_MIN,
  FAT_MIN_G_PER_KG_REF,
  FIBER_G_PER_1000_KCAL,
  FIBER_MAX_G,
  FIBER_MIN_G,
  PROTEIN_G_PER_KG,
  PROTEIN_MAX_ENERGY_SHARE,
  PROTEIN_MAX_G_PER_KG,
  PROTEIN_MIN_G_PER_KG,
} from './constants'
import type { DietTag, GoalType } from './types'

/**
 * Macro allocation (§25–§31). Priority order (§29):
 *   calories → protein → minimum fat → carbohydrates → fine tuning.
 * Protein is goal-aware g/kg on the REFERENCE weight (§26) — never a fixed
 * percentage of calories; fat keeps a physiological floor; carbs take the
 * validated remainder; fiber is energy-linked.
 */

export interface MacroPlan {
  proteinG: number
  fatG: number
  carbG: number
  fiberG: number
  /** True when the carb floor forced fat below its base share. */
  carbFloorApplied: boolean
}

const round = (n: number) => Math.round(n)

export function proteinTargetG(input: {
  goalType: GoalType
  referenceWeightKg: number
  targetCalories: number
  dietTags: DietTag[]
}): number {
  const highProtein = input.dietTags.includes('HIGH_PROTEIN')
  const gPerKg = Math.min(PROTEIN_G_PER_KG[input.goalType] + (highProtein ? 0.2 : 0), PROTEIN_MAX_G_PER_KG)
  let protein = input.referenceWeightKg * gPerKg
  // Energy-share ceiling: protein never crowds out the whole plate (§25).
  const shareCeiling = (input.targetCalories * PROTEIN_MAX_ENERGY_SHARE) / 4
  protein = Math.min(protein, shareCeiling)
  // Absolute g/kg floor (active adults; RDA 0.8 is sedentary-only).
  const floor = input.referenceWeightKg * PROTEIN_MIN_G_PER_KG
  return round(Math.max(protein, floor))
}

export function fatTargetG(input: {
  targetCalories: number
  referenceWeightKg: number
  dietTags: DietTag[]
}): number {
  const dietShare = DIET_FAT_SHARE[input.dietTags[0] ?? 'NORMAL'] // first diet tag wins the split
  const baseShare = dietShare ?? FAT_ENERGY_SHARE_BASE
  let fat = (input.targetCalories * baseShare) / 9
  const floor = Math.max(FAT_MIN_G_PER_KG_REF * input.referenceWeightKg, (input.targetCalories * FAT_ENERGY_SHARE_MIN) / 9)
  fat = Math.max(fat, floor)
  fat = Math.min(fat, (input.targetCalories * FAT_ENERGY_SHARE_MAX) / 9)
  return round(fat)
}

export function carbohydrateTargetG(input: {
  targetCalories: number
  proteinG: number
  fatG: number
  dietTags: DietTag[]
}): { carbG: number; floorApplied: boolean } {
  const keto = input.dietTags.includes('KETO')
  const floor = keto ? CARB_FLOOR_G_KETO : input.dietTags.includes('LOW_CARB') ? CARB_FLOOR_G_LOW_CARB : CARB_FLOOR_G_NORMAL
  const remaining = (input.targetCalories - input.proteinG * 4 - input.fatG * 9) / 4
  let carbG = Math.round(remaining)
  let floorApplied = false
  if (carbG < floor) {
    carbG = floor
    floorApplied = true
  }
  if (keto && carbG > CARB_CAP_G_KETO) carbG = CARB_CAP_G_KETO
  return { carbG, floorApplied }
}

export function fiberTargetG(targetCalories: number): number {
  return round(Math.min(Math.max((targetCalories / 1000) * FIBER_G_PER_1000_KCAL, FIBER_MIN_G), FIBER_MAX_G))
}
