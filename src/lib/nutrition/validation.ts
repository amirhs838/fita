import { AGE_MAX, AGE_MIN, HEIGHT_MAX_CM, HEIGHT_MIN_CM, WAIST_MAX_CM, WAIST_MIN_CM, WEIGHT_MAX_KG, WEIGHT_MIN_KG } from './constants'
import type { EngineInput, EngineWarning } from './types'

/**
 * Input validation (§43/§5): impossible values are rejected — never silently
 * converted into valid-looking data. The engine refuses to run on nonsense.
 */

export interface InputValidation {
  ok: boolean
  /** Persian message for the first blocking error (UI-safe). */
  errorFa?: string
  warnings: EngineWarning[]
}

export function validateEngineInputs(input: EngineInput): InputValidation {
  const warnings: EngineWarning[] = []

  if (!Number.isFinite(input.age) || input.age < AGE_MIN) {
    return { ok: false, errorFa: 'سن واردشده خیلی کم است.', warnings }
  }
  if (input.age > AGE_MAX) {
    return { ok: false, errorFa: 'سن واردشده خیلی زیاد است.', warnings }
  }
  if (!Number.isFinite(input.heightCm) || input.heightCm < HEIGHT_MIN_CM || input.heightCm > HEIGHT_MAX_CM) {
    return { ok: false, errorFa: 'قد واردشده معتبر نیست.', warnings }
  }
  if (!Number.isFinite(input.currentWeightKg) || input.currentWeightKg < WEIGHT_MIN_KG || input.currentWeightKg > WEIGHT_MAX_KG) {
    return { ok: false, errorFa: 'وزن واردشده معتبر نیست.', warnings }
  }
  if (input.measurements?.waistCm != null && (input.measurements.waistCm < WAIST_MIN_CM || input.measurements.waistCm > WAIST_MAX_CM)) {
    return { ok: false, errorFa: 'دور کمر واردشده معتبر نیست.', warnings }
  }

  // Contextual (non-blocking) notices.
  if (input.pregnancy || input.breastfeeding) {
    warnings.push({
      code: 'SPECIAL_STATE_CONSULT_DOCTOR',
      messageFa: 'در بارداری و شیردهی، برای برنامه تغذیه‌ای دقیق‌تر با پزشک یا متخصص تغذیه مشورت کن.',
    })
  }
  warnings.push({
    code: 'ESTIMATE_NOT_MEASUREMENT',
    messageFa: 'این مقادیر برآورد علمی بر اساس اطلاعات تو هستند؛ عدد دقیق متابولیسم فقط با اندازه‌گیری تخصصی به دست می‌آید.',
  })

  return { ok: true, warnings }
}
