import { ADJUSTED_WEIGHT_BMI_THRESHOLD, HEALTHY_BMI_MAX, HEALTHY_BMI_MIN } from './constants'
import { navyBodyFatPct, rfmBodyFatPct } from '@/lib/body-metrics'
import type { EngineMeasurements, Gender } from './types'

/**
 * Body-composition context (§20–§23): BMI as a screening indicator only,
 * healthy weight RANGE (never a single "ideal weight"), circumference-derived
 * body-fat estimates, waist-to-height context, and the protein reference
 * weight strategy for users with high body weight (§26).
 */

export function calcBmiValue(weightKg: number, heightCm: number): number {
  const m = heightCm / 100
  return weightKg / (m * m)
}

/** Healthy screening range from the adult BMI 18.5–24.9 band (§20). */
export function healthyWeightRangeKg(heightCm: number): { minKg: number; maxKg: number } {
  const h = heightCm / 100
  return {
    minKg: Math.round(HEALTHY_BMI_MIN * h * h),
    maxKg: Math.round(HEALTHY_BMI_MAX * h * h),
  }
}

export interface EstimatedBodyFat {
  pct: number
  method: 'NAVY' | 'RFM'
}

/**
 * Best available body-fat estimate from home measurements:
 * US Navy circumference method first (needs neck + waist; + hip for women),
 * RFM (waist-only, Woolcott & Bergman 2018) as the fallback. Returns null when
 * the measurements cannot support an estimate — the caller then uses LEVEL 1.
 */
export function estimateBodyFat(
  gender: Gender,
  heightCm: number,
  measurements: EngineMeasurements | null,
): EstimatedBodyFat | null {
  if (!measurements?.waistCm) return null
  if (measurements.neckCm) {
    const navy = navyBodyFatPct(gender, heightCm, measurements.waistCm, measurements.neckCm, measurements.hipCm ?? null)
    if (navy != null) return { pct: navy, method: 'NAVY' }
  }
  const rfm = rfmBodyFatPct(gender, heightCm, measurements.waistCm)
  return rfm != null ? { pct: rfm, method: 'RFM' } : null
}

/**
 * Weight at the top of the healthy BMI band — the anchor for adjusted body
 * weight in high-BMI contexts.
 */
function idealWeightAtHealthyBmi(heightCm: number): number {
  const h = heightCm / 100
  return HEALTHY_BMI_MAX * h * h
}

/**
 * Adjusted body weight for BMI ≥ 30 (§26): IBW + 0.25 × (actual − IBW).
 * Standard nutrition-practice adjustment so very high body weight does not
 * produce unrealistic protein targets.
 */
export function adjustedBodyWeightKg(heightCm: number, actualWeightKg: number): number {
  const ibw = idealWeightAtHealthyBmi(heightCm)
  if (actualWeightKg <= ibw) return actualWeightKg
  return ibw + 0.25 * (actualWeightKg - ibw)
}

/**
 * Protein reference weight (§26): actual weight for BMI < 30, adjusted body
 * weight above it. Documented deterministic rule — never blind actual weight
 * for every user.
 */
export function proteinReferenceWeightKg(heightCm: number, actualWeightKg: number): number {
  const bmi = calcBmiValue(actualWeightKg, heightCm)
  return bmi >= ADJUSTED_WEIGHT_BMI_THRESHOLD ? adjustedBodyWeightKg(heightCm, actualWeightKg) : actualWeightKg
}

/** Waist-to-height ratio — supplemental adiposity indicator (§23), never a calorie driver. */
export function waistToHeightRatio(measurements: EngineMeasurements | null, heightCm: number): number | null {
  if (!measurements?.waistCm || !heightCm) return null
  return measurements.waistCm / heightCm
}
