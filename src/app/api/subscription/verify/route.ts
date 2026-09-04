import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ApiError, handleError, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { db } from '@/lib/db'
import { getPaymentProvider } from '@/lib/payment/provider'
import { activatePro, getSubscriptionDto } from '@/lib/subscription/service'
import { findPlan } from '@/lib/subscription/plans'

const BodySchema = z.object({
  referenceId: z.string().trim().min(6).max(120),
})

/**
 * POST /api/subscription/verify — confirms a PENDING checkout after the
 * gateway callback (Phase 10). User-scoped: the order must belong to the
 * session user. On success the PRO tier activates for the plan duration.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()

    const rl = rateLimit(`verify:${user.id}`, 10, 60_000)
    if (!rl.allowed) {
      throw new ApiError(429, 'RATE_LIMITED', `درخواست‌های مکرر. ${rl.retryAfterSec} ثانیه دیگر تلاش کن.`)
    }

    const { referenceId } = BodySchema.parse(await req.json())

    const order = await db.paymentOrder.findUnique({ where: { referenceId } })
    if (!order || order.userId !== user.id) {
      throw new ApiError(404, 'ORDER_NOT_FOUND', 'سفارش پرداخت پیدا نشد.')
    }
    if (order.status === 'PAID' && order.paidAt) {
      return ok({ subscription: await getSubscriptionDto(user.id), activated: true })
    }
    if (order.status !== 'PENDING') {
      throw new ApiError(409, 'ORDER_NOT_PAYABLE', 'این سفارش قابل تأیید نیست.')
    }

    const provider = getPaymentProvider()
    const verdict = await provider.verifyPayment(referenceId)
    if (!verdict.paid) {
      await db.paymentOrder.update({
        where: { id: order.id },
        data: { status: 'FAILED' },
      })
      throw new ApiError(402, 'PAYMENT_NOT_CONFIRMED', 'پرداخت تأیید نشد. دوباره تلاش کن.')
    }

    const plan = findPlan(order.planId)
    if (!plan) throw new ApiError(500, 'INTERNAL', 'پلن سفارش معتبر نیست.')

    await db.paymentOrder.update({
      where: { id: order.id },
      data: { status: 'PAID', paidAt: new Date() },
    })
    await activatePro(user.id, plan.id, provider.id, plan.durationDays)

    return ok({ subscription: await getSubscriptionDto(user.id), activated: true })
  } catch (err) {
    return handleError(err)
  }
}
