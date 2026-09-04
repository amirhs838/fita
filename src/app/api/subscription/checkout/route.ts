import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ApiError, handleError, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { findPlan } from '@/lib/subscription/plans'
import { getPaymentProvider } from '@/lib/payment/provider'
import { activatePro, getSubscriptionDto } from '@/lib/subscription/service'

const BodySchema = z.object({
  planId: z.enum(['PRO_MONTHLY', 'PRO_YEARLY']),
})

/**
 * POST /api/subscription/checkout — provider-agnostic checkout (Phase 10).
 * Creates a PaymentOrder audit row + hands back the provider reference.
 * Providers that resolve instantly (mock) return status=PAID and the PRO
 * activation happens in the same request — the client-visible flow is
 * identical to a redirect-gateway that later calls /verify.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()
    const rl = rateLimit(`checkout:${user.id}`, 5, 60_000)
    if (!rl.allowed) throw new ApiError(429, 'RATE_LIMITED', 'کمی صبر کن و دوباره تلاش کن.')

    const { planId } = BodySchema.parse(await req.json())
    const plan = findPlan(planId)
    if (!plan) throw new ApiError(404, 'PLAN_NOT_FOUND', 'پلن انتخابی پیدا نشد.')

    const provider = getPaymentProvider()
    const checkout = await provider.createCheckout({
      userId: user.id,
      planId: plan.id,
      amountToman: plan.priceToman,
    })

    // Instant-resolution providers (mock): activate right away.
    if (checkout.status === 'PAID') {
      await activatePro(user.id, plan.id, provider.id, plan.durationDays)
    }

    return ok({
      referenceId: checkout.referenceId,
      status: checkout.status,
      redirectUrl: checkout.redirectUrl,
      subscription: await getSubscriptionDto(user.id),
    })
  } catch (err) {
    return handleError(err)
  }
}
