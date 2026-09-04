import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ApiError, clientIp, handleError, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { AiError } from '@/lib/ai/gateway'
import { ensureFoodFromScan, runFoodScan } from '@/lib/ai/scan'
import { consumeScan, getScanEntitlement, refundScan } from '@/lib/entitlements'

const BodySchema = z.object({
  /** Base64 data URL of the photo. In-memory only — never written to disk or DB. */
  imageDataUrl: z
    .string()
    .regex(
      /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/,
      'فرمت تصویر پشتیبانی نمی‌شود.',
    ),
})

const MAX_DECODED_BYTES = 6 * 1024 * 1024

/**
 * POST /api/scan — Phase 5 food vision.
 * Trial quota is consumed BEFORE the provider call (AI.md) and refunded if
 * the AI itself fails, so users never lose a scan to our errors.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()

    const rl = rateLimit(`scan:${user.id}`, 12, 60_000)
    if (!rl.allowed) {
      throw new ApiError(429, 'RATE_LIMITED', 'کمی صبر کن و دوباره تلاش کن.')
    }
    const rlIp = rateLimit(`scan-ip:${clientIp(req)}`, 40, 60_000)
    if (!rlIp.allowed) {
      throw new ApiError(429, 'RATE_LIMITED', 'درخواست‌های زیادی ارسال شده. کمی بعد تلاش کن.')
    }

    const body = BodySchema.parse(await req.json())

    const base64 = body.imageDataUrl.split(',')[1] ?? ''
    const decodedBytes = Math.floor((base64.length * 3) / 4)
    if (decodedBytes > MAX_DECODED_BYTES) {
      throw new ApiError(413, 'IMAGE_TOO_LARGE', 'حجم عکس زیاد است. عکس کوچک‌تری بردار.')
    }

    const entitlement = await getScanEntitlement(user.id)
    if (!entitlement.canScan) {
      throw new ApiError(
        403,
        entitlement.reason === 'EXPIRED' ? 'SUBSCRIPTION_EXPIRED' : 'SCAN_LIMIT_REACHED',
        entitlement.reason === 'EXPIRED'
          ? 'دوره آزمایشی تمام شده است.'
          : 'اسکن‌های آزمایشی به پایان رسید.',
      )
    }

    await consumeScan(user.id)

    try {
      const scan = await runFoodScan(body.imageDataUrl)

      if (scan.foods.length === 0) {
        return ok({
          foods: [],
          overallConfidence: scan.overallConfidence,
          scansRemaining:
            entitlement.scansRemaining === null ? null : entitlement.scansRemaining - 1,
        })
      }

      const resolved = await Promise.all(
        scan.foods.map(async (food) => {
          const match = await ensureFoodFromScan(food, user.id)
          return {
            foodId: match.foodId,
            nameFa: match.nameFa,
            matchedToDb: match.matched,
            estimatedGrams: Math.round(food.estimatedGrams),
            kcalPer100g: match.kcalPer100g,
            confidence: Math.round(food.confidence * 100) / 100,
          }
        }),
      )

      return ok({
        foods: resolved,
        overallConfidence: scan.overallConfidence,
        scansRemaining:
          entitlement.scansRemaining === null ? null : entitlement.scansRemaining - 1,
      })
    } catch (err) {
      // AI failure — refund the consumed scan; the rate limits still apply.
      await refundScan(user.id).catch(() => undefined)
      if (err instanceof AiError) {
        throw new ApiError(502, err.code, err.message)
      }
      throw err
    } finally {
      // The image lives only inside this request scope — nothing persisted.
      void body.imageDataUrl
    }
  } catch (err) {
    return handleError(err)
  }
}
