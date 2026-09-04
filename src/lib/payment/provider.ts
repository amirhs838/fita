import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { AppConfig } from '@/lib/config'

/**
 * Payment provider interface (Phase 10) — the gateway is never hardcoded.
 * A real gateway (Zarinpal, IDPay, …) implements the same two methods and is
 * selected via PAYMENT_PROVIDER. No credentials are ever stored in DB rows;
 * metaJson only carries non-secret references.
 *
 * Flow (mirrors real Iranian gateways):
 *   1. createCheckout  → referenceId (+redirectUrl when the provider needs a redirect)
 *   2. gateway callback / user return
 *   3. verifyPayment(referenceId) → paid? → server activates PRO
 */

export type CheckoutStatus = 'PENDING' | 'PAID'

export interface CheckoutRequest {
  userId: string
  planId: string
  amountToman: number
}

export interface CheckoutResult {
  referenceId: string
  status: CheckoutStatus
  redirectUrl: string | null
}

export interface VerifyResult {
  paid: boolean
  amountToman: number | null
}

export interface PaymentProvider {
  readonly id: string
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>
  verifyPayment(referenceId: string): Promise<VerifyResult>
}

/**
 * Mock provider (sandbox/dev): simulates an instant successful payment.
 * The order is created directly in PAID state so the full activation path
 * (order → verify → activatePro) is exercised exactly as with a real gateway.
 */
class MockProvider implements PaymentProvider {
  readonly id = 'mock'

  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    const referenceId = `mock-${randomUUID()}`
    await db.paymentOrder.create({
      data: {
        userId: req.userId,
        planId: req.planId,
        provider: this.id,
        amountToman: req.amountToman,
        referenceId,
        status: 'PAID',
        paidAt: new Date(),
        metaJson: JSON.stringify({ simulated: true }),
      },
    })
    return { referenceId, status: 'PAID', redirectUrl: null }
  }

  async verifyPayment(referenceId: string): Promise<VerifyResult> {
    const order = await db.paymentOrder.findUnique({ where: { referenceId } })
    if (!order) return { paid: false, amountToman: null }
    return { paid: order.status === 'PAID', amountToman: order.amountToman }
  }
}

/**
 * Zarinpal placeholder — throws until env credentials exist. This keeps the
 * interface real (a future PR fills the two REST calls) without faking success.
 */
class ZarinpalProvider implements PaymentProvider {
  readonly id = 'zarinpal'

  private merchantId(): string {
    const id = process.env.ZARINPAL_MERCHANT_ID?.trim() ?? ''
    if (!id) {
      throw new Error('ZARINPAL_MERCHANT_ID missing — payment provider unconfigured')
    }
    return id
  }

  async createCheckout(_req: CheckoutRequest): Promise<CheckoutResult> {
    this.merchantId()
    throw new Error('zarinpal checkout not implemented in this environment')
  }

  async verifyPayment(_referenceId: string): Promise<VerifyResult> {
    this.merchantId()
    throw new Error('zarinpal verify not implemented in this environment')
  }
}

export function getPaymentProvider(): PaymentProvider {
  switch (AppConfig.payment.provider) {
    case 'zarinpal':
      return new ZarinpalProvider()
    case 'mock':
    default:
      return new MockProvider()
  }
}
