import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handleError, ApiError, ok } from '@/lib/api'
import { requireUser, clearSessionCookie } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { db } from '@/lib/db'

const BodySchema = z.strictObject({
  /** Explicit confirmation — the client must send literal true. */
  confirm: z.literal(true),
})

/**
 * POST /api/account/delete — right to erasure (Phase 12 privacy).
 *
 * Hard-deletes every row that belongs to the session user in child-first FK
 * order inside one transaction, then removes the user row itself:
 *   - food logs + items, water, weights, measurements, goals, profile
 *   - meal plans (days/items cascade), coach conversations (messages cascade)
 *   - achievements, stats, leaderboard, challenges, analytics, prefs, subscription
 *   - private custom foods (created via AI scan / manual entry)
 *
 * Session cookie is cleared and the client drops its stored token, so the
 * stale JWT is dead too (user row gone → requireUser → 401 everywhere).
 *
 * Note for production: if a real payment gateway is used, PaymentOrder rows
 * should be retained (anonymized) for financial audit instead of deleted.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()

    const rl = rateLimit(`delete:${user.id}`, 3, 60_000)
    if (!rl.allowed) {
      throw new ApiError(429, 'RATE_LIMITED', `درخواست‌های مکرر. ${rl.retryAfterSec} ثانیه دیگر تلاش کن.`)
    }

    const parsed = BodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      throw new ApiError(422, 'CONFIRMATION_REQUIRED', 'برای حذف حساب، تأیید صریح لازم است.')
    }

    await db.$transaction(async (tx) => {
      // ── child rows first (FK-safe order) ──
      await tx.analyticsEvent.deleteMany({ where: { userId: user.id } })
      await tx.challengeParticipant.deleteMany({ where: { userId: user.id } })
      await tx.leaderboardRecord.deleteMany({ where: { userId: user.id } })
      await tx.userAchievement.deleteMany({ where: { userId: user.id } })
      await tx.userStats.deleteMany({ where: { userId: user.id } })
      await tx.notificationPreference.deleteMany({ where: { userId: user.id } })
      await tx.paymentOrder.deleteMany({ where: { userId: user.id } })
      await tx.subscription.deleteMany({ where: { userId: user.id } })
      await tx.progressRecord.deleteMany({ where: { userId: user.id } })
      await tx.aIConversation.deleteMany({ where: { userId: user.id } }) // messages cascade
      await tx.waterLog.deleteMany({ where: { userId: user.id } })
      await tx.foodLog.deleteMany({ where: { userId: user.id } }) // items cascade
      await tx.mealPlan.deleteMany({ where: { userId: user.id } }) // days + items cascade
      await tx.favoriteFood.deleteMany({ where: { userId: user.id } })
      await tx.dislikedFood.deleteMany({ where: { userId: user.id } })
      await tx.allergy.deleteMany({ where: { userId: user.id } })
      await tx.dietPreference.deleteMany({ where: { userId: user.id } })
      await tx.weightRecord.deleteMany({ where: { userId: user.id } })
      await tx.bodyMeasurement.deleteMany({ where: { userId: user.id } })
      await tx.goal.deleteMany({ where: { userId: user.id } })
      await tx.userProfile.deleteMany({ where: { userId: user.id } })

      // Private foods created by this user (servings first — required FK, restrict)
      await tx.foodServing.deleteMany({ where: { food: { createdByUserId: user.id } } })
      await tx.food.deleteMany({ where: { createdByUserId: user.id } })

      // ── finally the user row itself ──
      await tx.user.delete({ where: { id: user.id } })
    })

    await clearSessionCookie()

    return ok({ deleted: true })
  } catch (err) {
    return handleError(err)
  }
}
