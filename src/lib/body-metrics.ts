/**
 * Body-composition analysis — research-backed circumference methods that need
 * nothing but a home tape measure. Pure functions (client + server safe).
 *
 * Methods (verified against DXA in literature):
 *  1. US Navy circumference method (Hodgdon & Beckett, 1984) — SE ≈ 3–4%,
 *     beats 2-point bioimpedance; metric form via 495/(A − B·log10 + C·log10) − 450.
 *  2. RFM — Relative Fat Mass (Woolcott & Bergman, Br J Nutr 2018) — more
 *     accurate than BMI for whole-body fat (women 91.5% vs 21.6%); needs only height/waist.
 *  3. WHtR — waist-to-height ratio; universal 0.5 cutoff (NICE 2022; 2025
 *     cohorts reaffirm it outperforms BMI for cardiometabolic risk).
 *  4. BMI — auxiliary indicator ONLY (never a decision criterion on its own).
 *  5. Katch-McArdle BMR from lean mass (370 + 21.6·LBM) as a cross-check to
 *     the Mifflin-St Jeor target engine.
 */

export type GenderSlim = 'MALE' | 'FEMALE'

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

/** US Navy body-fat % (metric). Returns null when inputs are inconsistent. */
export function navyBodyFatPct(gender: GenderSlim, heightCm: number, waistCm: number, neckCm: number, hipCm?: number | null): number | null {
  try {
    if (gender === 'MALE') {
      const d = waistCm - neckCm
      if (d <= 2) return null
      const v = 495 / (1.0324 - 0.19077 * Math.log10(d) + 0.15456 * Math.log10(heightCm)) - 450
      return Number.isFinite(v) ? clamp(v, 3, 65) : null
    }
    const d = waistCm + (hipCm ?? NaN) - neckCm
    if (!Number.isFinite(d) || d <= 2) return null
    const v = 495 / (1.29579 - 0.35004 * Math.log10(d) + 0.221 * Math.log10(heightCm)) - 450
    return Number.isFinite(v) ? clamp(v, 5, 70) : null
  } catch {
    return null
  }
}

/** Relative Fat Mass (Woolcott & Bergman 2018) — waist-only estimator. */
export function rfmBodyFatPct(gender: GenderSlim, heightCm: number, waistCm: number): number | null {
  if (!waistCm || waistCm <= 0) return null
  const base = gender === 'MALE' ? 64 : 76
  const v = base - 20 * (heightCm / waistCm)
  return Number.isFinite(v) ? clamp(v, 3, 70) : null
}

/** Waist-to-height ratio (0.5 = universal healthy ceiling). */
export function whtr(heightCm: number, waistCm: number): number | null {
  if (!heightCm || !waistCm) return null
  return waistCm / heightCm
}

export function whtrCategory(ratio: number): { key: 'LOW' | 'HEALTHY' | 'INCREASED' | 'HIGH'; labelFa: string } {
  if (ratio < 0.4) return { key: 'LOW', labelFa: 'کمتر از محدوده رایج' }
  if (ratio < 0.5) return { key: 'HEALTHY', labelFa: 'سالم' }
  if (ratio < 0.6) return { key: 'INCREASED', labelFa: 'ریسک افزایش‌یافته' }
  return { key: 'HIGH', labelFa: 'ریسک بالا' }
}

/** Waist-to-hip ratio — WHO cardiovascular risk indicator. */
export function whr(waistCm: number, hipCm: number): number | null {
  if (!waistCm || !hipCm) return null
  return waistCm / hipCm
}

export function whrCategory(gender: GenderSlim, ratio: number): { high: boolean; labelFa: string } {
  const cutoff = gender === 'MALE' ? 0.9 : 0.85
  return ratio > cutoff
    ? { high: true, labelFa: 'الگوی ریسک بالای شکمی' }
    : { high: false, labelFa: 'الگوی سالم' }
}

/** BMI — auxiliary index only. */
export function bmiCategory(bmi: number): { labelFa: string; tone: 'GOOD' | 'WARN' | 'BAD' } {
  if (bmi < 18.5) return { labelFa: 'کم‌وزن', tone: 'WARN' }
  if (bmi < 25) return { labelFa: 'محدوده سالم', tone: 'GOOD' }
  if (bmi < 30) return { labelFa: 'اضافه‌وزن', tone: 'WARN' }
  return { labelFa: 'چاقی', tone: 'BAD' }
}

/** Body-fat % bands (ACE, gender-specific). */
export function bodyFatCategory(gender: GenderSlim, pct: number): { labelFa: string; tone: 'GOOD' | 'WARN' | 'BAD' } {
  const m = gender === 'MALE'
  if (pct < (m ? 6 : 14)) return { labelFa: 'چربی ضروری', tone: 'WARN' }
  if (pct < (m ? 14 : 21)) return { labelFa: 'سطح ورزشکاران', tone: 'GOOD' }
  if (pct < (m ? 18 : 25)) return { labelFa: 'تناسب اندام', tone: 'GOOD' }
  if (pct < (m ? 25 : 32)) return { labelFa: 'متوسط', tone: 'WARN' }
  return { labelFa: 'چاقی', tone: 'BAD' }
}

/** Healthy-weight span from the BMI 18.5–24.9 band. */
export function idealWeightRangeKg(heightCm: number): { min: number; max: number } {
  const h = heightCm / 100
  return { min: Math.round(18.5 * h * h), max: Math.round(24.9 * h * h) }
}

/** Fat-free mass (kg) + FFMI (normalized to 1.8m). */
export function leanMassKg(weightKg: number, bfPct: number): number {
  return weightKg * (1 - bfPct / 100)
}

export function ffmi(weightKg: number, heightCm: number, bfPct: number): number {
  const h = heightCm / 100
  return leanMassKg(weightKg, bfPct) / (h * h)
}

/** Katch-McArdle BMR — uses lean mass; a precise cross-check when BF% is known. */
export function katchMcArdleBmr(weightKg: number, bfPct: number): number {
  return 370 + 21.6 * leanMassKg(weightKg, bfPct)
}

export interface BodyAnalysisInput {
  gender: GenderSlim
  heightCm: number
  weightKg: number
  waistCm?: number | null
  hipCm?: number | null
  neckCm?: number | null
}

export interface BodyAnalysis {
  bmi: number
  bmiLabelFa: string
  bmiTone: 'GOOD' | 'WARN' | 'BAD'
  idealWeight: { min: number; max: number }
  /** Best available body-fat estimate: Navy first, RFM fallback. */
  bodyFat: { pct: number; methodFa: string } | null
  bodyFatLabelFa: string | null
  bodyFatTone: 'GOOD' | 'WARN' | 'BAD' | null
  whtr: { ratio: number; labelFa: string; tone: 'GOOD' | 'WARN' | 'BAD' } | null
  whr: { ratio: number; labelFa: string; high: boolean } | null
  leanKg: number | null
  ffmiVal: number | null
  katchBmr: number | null
}

const tone = (key: string): 'GOOD' | 'WARN' | 'BAD' =>
  key === 'LOW' || key === 'HEALTHY' ? 'GOOD' : key === 'INCREASED' ? 'WARN' : 'BAD'

/** Aggregate every metric the onboarding results step can show. */
export function computeBodyAnalysis(input: BodyAnalysisInput): BodyAnalysis {
  const bmiVal = input.weightKg / (input.heightCm / 100) ** 2
  const bmiCat = bmiCategory(bmiVal)

  let bodyFat: BodyAnalysis['bodyFat'] = null
  let bodyFatLabelFa: string | null = null
  let bodyFatTone: BodyAnalysis['bodyFatTone'] = null

  if (input.waistCm && input.neckCm) {
    const navy = navyBodyFatPct(input.gender, input.heightCm, input.waistCm, input.neckCm, input.hipCm)
    if (navy != null) {
      const cat = bodyFatCategory(input.gender, navy)
      bodyFat = { pct: navy, methodFa: 'روش استاندارد نیروی دریایی آمریکا' }
      bodyFatLabelFa = cat.labelFa
      bodyFatTone = cat.tone
    }
  }
  if (!bodyFat && input.waistCm) {
    const rfm = rfmBodyFatPct(input.gender, input.heightCm, input.waistCm)
    if (rfm != null) {
      const cat = bodyFatCategory(input.gender, rfm)
      bodyFat = { pct: rfm, methodFa: 'شاخص RFM (اعتبارسنجی‌شده با DEXA)' }
      bodyFatLabelFa = cat.labelFa
      bodyFatTone = cat.tone
    }
  }

  const whtrVal = input.waistCm ? whtr(input.heightCm, input.waistCm) : null
  const whtrCat = whtrVal != null ? whtrCategory(whtrVal) : null

  const whrVal = input.waistCm && input.hipCm ? whr(input.waistCm, input.hipCm) : null
  const whrCat = whrVal != null ? whrCategory(input.gender, whrVal) : null

  const lean = bodyFat ? leanMassKg(input.weightKg, bodyFat.pct) : null

  return {
    bmi: bmiVal,
    bmiLabelFa: bmiCat.labelFa,
    bmiTone: bmiCat.tone,
    idealWeight: idealWeightRangeKg(input.heightCm),
    bodyFat,
    bodyFatLabelFa,
    bodyFatTone,
    whtr:
      whtrVal != null && whtrCat
        ? { ratio: whtrVal, labelFa: whtrCat.labelFa, tone: tone(whtrCat.key) }
        : null,
    whr: whrVal != null && whrCat ? { ratio: whrVal, labelFa: whrCat.labelFa, high: whrCat.high } : null,
    leanKg: lean,
    ffmiVal: lean && bodyFat ? ffmi(input.weightKg, input.heightCm, bodyFat.pct) : null,
    katchBmr: lean && bodyFat ? katchMcArdleBmr(input.weightKg, bodyFat.pct) : null,
  }
}
