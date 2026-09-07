import { CALIBRATION_HYSTERESIS_KCAL, CALIBRATION_MAX_ADJUSTMENT_KCAL, KCAL_PER_KG_BODY_MASS } from './constants'
import type { ConfidenceLevel, EnergyCalibrationInput } from './types'

/**
 * Trend-based energy calibration (§13/§46/§48) — LEVEL 3 of the hierarchy.
 * PURE function: the caller gathers ≥2 weeks of weight history and ≥10 logged
 * intake days from the DB; the engine only decides direction and size of a
 * SMALL, bounded adjustment. Never reacts to one day, never oscillates.
 */

export interface CalibrationDecision {
  /** Signed kcal/day correction applied to the target (0 when no change). */
  adjustmentKcal: number
  reason: 'INSUFFICIENT_DATA' | 'WITHIN_NOISE' | 'ADJUSTED'
}

/**
 * Gate + decide. energyError = unaccounted kcal/day implied by the gap between
 * the observed weekly trend and the trend the current target would produce.
 * Hysteresis (75 kcal) + clamp (±150) keep the system stable (§13/§46).
 */
export function calibrateEnergyNeeds(input: {
  calibration: EnergyCalibrationInput | null
  /** Weekly change the CURRENT target would produce at the current weight (kg/week, signed). */
  predictedWeeklyChangeKg: number
}): CalibrationDecision {
  const c = input.calibration
  if (!c || c.loggedDays < 10) {
    return { adjustmentKcal: 0, reason: 'INSUFFICIENT_DATA' }
  }
  const unaccountedKcalPerDay = ((c.observedWeeklyChangeKg - input.predictedWeeklyChangeKg) * KCAL_PER_KG_BODY_MASS) / 7
  // Observed change LESS negative than predicted → true needs are lower → cut target.
  if (Math.abs(unaccountedKcalPerDay) < CALIBRATION_HYSTERESIS_KCAL) {
    return { adjustmentKcal: 0, reason: 'WITHIN_NOISE' }
  }
  const adjustment = -Math.max(-CALIBRATION_MAX_ADJUSTMENT_KCAL, Math.min(CALIBRATION_MAX_ADJUSTMENT_KCAL, unaccountedKcalPerDay))
  return { adjustmentKcal: Math.round(adjustment), reason: 'ADJUSTED' }
}

/** Rolling-average trend weight helper (§48) — exported for the caller pipeline. */
export function trendWeightKg(series: { date: string; weightKg: number }[]): number | null {
  if (series.length === 0) return null
  const latest = series.slice(-7)
  return latest.reduce((s, r) => s + r.weightKg, 0) / latest.length
}

/** Least-squares slope of weight (kg/day) over a series → kg/week. Pure math. */
export function weeklyTrendKg(series: { date: string; weightKg: number }[]): number | null {
  if (series.length < 5) return null
  const t0 = Date.parse(series[0].date)
  const pts = series.map((r) => ({ t: (Date.parse(r.date) - t0) / 86_400_000, w: r.weightKg }))
  const spanDays = pts[pts.length - 1].t
  if (spanDays < 14) return null
  const n = pts.length
  const sumT = pts.reduce((s, p) => s + p.t, 0)
  const sumW = pts.reduce((s, p) => s + p.w, 0)
  const sumTW = pts.reduce((s, p) => s + p.t * p.w, 0)
  const sumT2 = pts.reduce((s, p) => s + p.t * p.t, 0)
  const denom = n * sumT2 - sumT * sumT
  if (Math.abs(denom) < 1e-9) return null
  const slopePerDay = (n * sumTW - sumT * sumW) / denom
  return slopePerDay * 7
}

/** Confidence bookkeeping (§42): HIGH only when trend calibration actually ran. */
export function confidenceFor(opts: { calibrationApplied: boolean; bodyFatUsed: boolean }): ConfidenceLevel {
  if (opts.calibrationApplied) return 'HIGH'
  if (opts.bodyFatUsed) return 'MODERATE'
  return 'LOW'
}
