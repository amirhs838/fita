import { db } from '@/lib/db'
import { planCatalog } from '@/lib/subscription/plans'
import { AppConfig } from '@/lib/config'

/**
 * Subscription service (Phase 10) — tier state is derived lazily:
 * - trial ended → EXPIRED (persisted so /api/me, paywall and gates agree)
 * - PRO past proExpiresAt → EXPIRED (real gateways would renew; sandbox doesn't)
 */

const DAY_MS = 24 * 60 * 60 * 1000

export interface SubscriptionDto {
  tier: 'FREE_TRIAL' | 'PRO' | 'EXPIRED'
  trialEndsAt: string | null
  trialDaysLeft: number | null
  scansUsed: number
  scansLimit: number
  scansRemaining: number | null
  proExpiresAt: string | null
  provider: string | null
  paymentProvider: string
  plans: ReturnType<typeof planCatalog>
}

/** Lazy tier sync — writes EXPIRED at most once; no-op afterwards. */
export async function syncSubscriptionTier(userId: string): Promise<void> {
  const sub = await db.subscription.findUnique({ where: { userId } })
  if (!sub) return
  const now = Date.now()

  if (sub.tier === 'FREE_TRIAL' && sub.trialEndsAt && sub.trialEndsAt.getTime() < now) {
    await db.subscription.update({ where: { userId }, data: { tier: 'EXPIRED' } })
    return
  }
  if (sub.tier === 'PRO' && sub.proExpiresAt && sub.proExpiresAt.getTime() < now) {
    await db.subscription.update({ where: { userId }, data: { tier: 'EXPIRED' } })
  }
}

export async function activatePro(
  userId: string,
  planId: string,
  provider: string,
  durationDays: number,
): Promise<void> {
  const now = new Date()
  const expires = new Date(now.getTime() + durationDays * DAY_MS)
  await db.subscription.updateMany({
    where: { userId },
    data: {
      tier: 'PRO',
      proStartedAt: now,
      proExpiresAt: expires,
      provider,
    },
  })
}

export async function getSubscriptionDto(userId: string): Promise<SubscriptionDto> {
  const sub = await db.subscription.findUnique({ where: { userId } })
  const now = Date.now()

  const tier = (sub?.tier ?? 'EXPIRED') as SubscriptionDto['tier']
  const trialEndsAt = sub?.trialEndsAt ?? null
  const trialDaysLeft =
    tier === 'FREE_TRIAL' && trialEndsAt
      ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now) / DAY_MS))
      : null
  const scansRemaining =
    tier === 'PRO' ? null : Math.max(0, (sub?.scansLimit ?? 0) - (sub?.scansUsed ?? 0))

  return {
    tier,
    trialEndsAt: trialEndsAt?.toISOString() ?? null,
    trialDaysLeft,
    scansUsed: sub?.scansUsed ?? 0,
    scansLimit: sub?.scansLimit ?? 0,
    scansRemaining,
    proExpiresAt: sub?.proExpiresAt?.toISOString() ?? null,
    provider: sub?.provider ?? null,
    paymentProvider: AppConfig.payment.provider,
    plans: planCatalog(),
  }
}
