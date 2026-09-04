import { AppConfig } from '@/lib/config'

/**
 * Subscription plan catalog (Phase 10).
 * Prices are Toman, env-overridable (AppConfig.payment). Adding a plan =
 * adding an entry here + a durationDays value — no per-feature entitlement
 * code changes needed.
 */

export type PlanId = 'PRO_MONTHLY' | 'PRO_YEARLY'

export interface PlanDef {
  id: PlanId
  titleFa: string
  subtitleFa: string
  priceToman: number
  durationDays: number
  perMonthToman: number
  discountPct: number | null
  badgeFa: string | null
  featuresFa: string[]
}

export function planCatalog(): PlanDef[] {
  const monthly = AppConfig.payment.proMonthlyToman
  const yearly = AppConfig.payment.proYearlyToman
  const yearlyPerMonth = Math.round(yearly / 12)
  const discountPct =
    monthly > 0 && yearlyPerMonth < monthly
      ? Math.round((1 - yearlyPerMonth / monthly) * 100)
      : null

  const features = [
    'اسکن نامحدود غذا با عکس',
    'مربی هوشمند بدون محدودیت',
    'برنامه غذایی 7روزه شخصی‌سازی‌شده',
    'پیشرفت، زنجیره و نشان‌ها',
  ]

  return [
    {
      id: 'PRO_MONTHLY',
      titleFa: 'فیتا پلاس — ماهانه',
      subtitleFa: 'دسترسی کامل، تمدید خودکار ماهانه',
      priceToman: monthly,
      durationDays: 30,
      perMonthToman: monthly,
      discountPct: null,
      badgeFa: null,
      featuresFa: features,
    },
    {
      id: 'PRO_YEARLY',
      titleFa: 'فیتا پلاس — سالانه',
      subtitleFa: 'بهترین انتخاب برای نتیجه پایدار',
      priceToman: yearly,
      durationDays: 365,
      perMonthToman: yearlyPerMonth,
      discountPct,
      badgeFa: discountPct ? 'پیشنهاد صرفه‌ای' : null,
      featuresFa: features,
    },
  ]
}

export function findPlan(planId: string): PlanDef | null {
  return planCatalog().find((p) => p.id === planId) ?? null
}
