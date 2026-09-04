import { db } from '@/lib/db'

/**
 * Entitlements — derived from the Subscription row, never hardcoded per feature.
 * FREE_TRIAL counts scans; PRO is unlimited; EXPIRED blocks gated features.
 */

export type GateReason = 'PRO' | 'TRIAL_OK' | 'SCAN_LIMIT_REACHED' | 'EXPIRED'

export interface ScanEntitlement {
  canScan: boolean
  reason: GateReason
  /** null = unlimited (PRO) */
  scansRemaining: number | null
}

export async function getScanEntitlement(userId: string): Promise<ScanEntitlement> {
  const sub = await db.subscription.findUnique({ where: { userId } })
  if (!sub) return { canScan: false, reason: 'EXPIRED', scansRemaining: 0 }

  if (sub.tier === 'PRO') {
    return { canScan: true, reason: 'PRO', scansRemaining: null }
  }

  if (sub.tier === 'FREE_TRIAL') {
    const expired = sub.trialEndsAt ? sub.trialEndsAt.getTime() < Date.now() : true
    if (expired) return { canScan: false, reason: 'EXPIRED', scansRemaining: 0 }
    const remaining = Math.max(0, sub.scansLimit - sub.scansUsed)
    return remaining > 0
      ? { canScan: true, reason: 'TRIAL_OK', scansRemaining: remaining }
      : { canScan: false, reason: 'SCAN_LIMIT_REACHED', scansRemaining: 0 }
  }

  return { canScan: false, reason: 'EXPIRED', scansRemaining: 0 }
}

/**
 * Consume one scan from the trial quota. Called BEFORE the provider call
 * (AI.md — cost control / parallel-abuse protection). Pair with refundScan()
 * when the AI itself fails so users are never charged for our errors.
 */
export async function consumeScan(userId: string): Promise<void> {
  await db.subscription.updateMany({
    where: { userId, tier: 'FREE_TRIAL' },
    data: { scansUsed: { increment: 1 } },
  })
}

export async function refundScan(userId: string): Promise<void> {
  await db.subscription.updateMany({
    where: { userId, tier: 'FREE_TRIAL', scansUsed: { gt: 0 } },
    data: { scansUsed: { decrement: 1 } },
  })
}
