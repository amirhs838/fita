import { NextRequest } from 'next/server'
import { handleError, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { syncSubscriptionTier, getSubscriptionDto } from '@/lib/subscription/service'

/**
 * GET /api/subscription — full subscription state + plan catalog.
 * Tier is synced lazily (trial/PRO expiry → EXPIRED) before reading.
 */
export async function GET(_req: NextRequest) {
  try {
    const user = await requireUser()
    await syncSubscriptionTier(user.id)
    return ok(await getSubscriptionDto(user.id))
  } catch (err) {
    return handleError(err)
  }
}
