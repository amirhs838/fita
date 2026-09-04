/**
 * Central configuration — nothing feature-critical is hardcoded elsewhere.
 * All values are env-overridable (see ENVIRONMENT.md / .env.example).
 */

function intEnv(key: string, fallback: number): number {
  const raw = process.env[key]
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function strEnv(key: string, fallback: string): string {
  const raw = process.env[key]?.trim()
  return raw ? raw : fallback
}

const openRouterKey = process.env.OPENROUTER_API_KEY?.trim() ?? ''

/** Shared default meal reminder times (HH:MM) — prefs API + reminder engine. */
export const DEFAULT_MEAL_TIMES = ['08:30', '13:00', '17:00', '21:00']

export const AppConfig = {
  appNameFa: 'فیتا',
  appNameEn: 'Fita',

  session: {
    cookieName: 'fita_session',
    /** 7 days — fresh browsers/sessions must re-authenticate with phone + OTP. */
    ttlDays: intEnv('SESSION_TTL_DAYS', 7),
  },

  otp: {
    /** dev = code echoed in response + logged (development only). sms = plug-in point (src/lib/otp.ts). */
    provider: strEnv('OTP_PROVIDER', 'dev'),
    codeLength: 6,
    ttlSeconds: intEnv('OTP_TTL_SECONDS', 120),
    maxAttempts: intEnv('OTP_MAX_ATTEMPTS', 5),
    resendCooldownSeconds: intEnv('OTP_RESEND_COOLDOWN_SECONDS', 60),
    maxPerHourPerPhone: intEnv('OTP_MAX_PER_HOUR_PER_PHONE', 5),
    maxPerHourPerIp: intEnv('OTP_MAX_PER_HOUR_PER_IP', 20),
  },

  ai: {
    /** openrouter | zai | mock — auto-detected when empty */
    provider: strEnv('AI_PROVIDER', openRouterKey ? 'openrouter' : 'zai'),
    openRouterKey,
    textModel: strEnv('OPENROUTER_TEXT_MODEL', 'openai/gpt-4o-mini'),
    visionModel: strEnv('OPENROUTER_VISION_MODEL', 'openai/gpt-4o-mini'),
  },

  trial: {
    days: intEnv('FREE_TRIAL_DAYS', 3),
    scanLimit: intEnv('FREE_SCAN_LIMIT', 5),
  },

  /**
   * Payment — provider-agnostic (Phase 10). `mock` simulates an instant
   * successful gateway (sandbox/dev); real gateways plug into
   * src/lib/payment/provider.ts and are selected via PAYMENT_PROVIDER.
   */
  payment: {
    provider: strEnv('PAYMENT_PROVIDER', 'mock'),
    proMonthlyToman: intEnv('PRO_MONTHLY_TOMAN', 149_000),
    proYearlyToman: intEnv('PRO_YEARLY_TOMAN', 1_290_000),
  },

  /** Hard safety floors for the Nutrition Engine (Phase 3). */
  safety: {
    minKcalFemale: intEnv('SAFETY_MIN_KCAL_FEMALE', 1200),
    minKcalMale: intEnv('SAFETY_MIN_KCAL_MALE', 1500),
    maxWeeklyLossKg: 0.75,
    maxWeeklyGainKg: 0.5,
  },
} as const
