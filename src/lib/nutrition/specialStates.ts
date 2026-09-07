import { BREASTFEEDING_ENERGY_DELTA_KCAL, PREGNANCY_ENERGY_DELTA_KCAL, PREGNANCY_GWG_BY_BMI } from './constants'
import { calcBmiValue } from './bodyComposition'
import type { EngineInput, EngineWarning } from './types'

/**
 * Special physiological states (§32/§33) — completely separate strategies:
 * NO weight-loss deficits during pregnancy or breastfeeding, energy additions
 * per IOM guidance, and gestational weight-gain guidance for pregnancy.
 */

export interface SpecialStatePlan {
  energyDeltaKcal: number
  /** Force the calorie target to at least maintenance + delta (no deficits). */
  forbidDeficit: boolean
  warnings: EngineWarning[]
  gestationalWeightGainRangeKg: { min: number; max: number } | null
}

export function resolveSpecialStates(input: EngineInput): SpecialStatePlan {
  const warnings: EngineWarning[] = []
  let energyDeltaKcal = 0
  let forbidDeficit = false
  let gestationalWeightGainRangeKg: SpecialStatePlan['gestationalWeightGainRangeKg'] = null

  if (input.pregnancy) {
    // Trimester is not collected (documented limitation) → 2nd-trimester default.
    energyDeltaKcal += PREGNANCY_ENERGY_DELTA_KCAL
    forbidDeficit = true
    warnings.push({
      code: 'PREGNANCY_WEIGHT_LOSS_NOT_ALLOWED',
      messageFa: 'در بارداری کاهش وزن توصیه نمی‌شود؛ هدف فیتا در این دوره حفظ سلامت تو و کودکت است.',
    })
    const bmi = calcBmiValue(input.currentWeightKg, input.heightCm)
    const row = PREGNANCY_GWG_BY_BMI.find((r) => bmi < r.maxBmi) ?? PREGNANCY_GWG_BY_BMI[PREGNANCY_GWG_BY_BMI.length - 1]
    gestationalWeightGainRangeKg = { min: row.minKg, max: row.maxKg }
  }

  if (input.breastfeeding) {
    // 0–6-month default; exclusive vs partial not collected (documented limitation).
    energyDeltaKcal += BREASTFEEDING_ENERGY_DELTA_KCAL
    forbidDeficit = true
    warnings.push({
      code: 'BREASTFEEDING_AGGRESSIVE_DEFICIT',
      messageFa: 'در شیردهی رژیم‌های سخت ممنوع است؛ کالری تو برای تولید شیر کافی تنظیم شده.',
    })
  }

  return { energyDeltaKcal, forbidDeficit, warnings, gestationalWeightGainRangeKg }
}
