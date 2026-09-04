import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ApiError, handleError, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { isValidDayKey, todayIso } from '@/lib/date'
import { db } from '@/lib/db'
import { awardAchievement } from '@/lib/gamification'

const BodySchema = z.object({
  weightKg: z.number().min(35).max(250),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

/** GET /api/weight — last 90 entries ascending (chart-friendly). */
export async function GET() {
  try {
    const user = await requireUser()
    const records = await db.weightRecord.findMany({
      where: { userId: user.id },
      orderBy: { date: 'desc' },
      take: 90,
    })
    return ok({
      records: records.reverse().map((r) => ({ date: r.date, weightKg: r.weightKg, source: r.source })),
    })
  } catch (err) {
    return handleError(err)
  }
}

/**
 * POST /api/weight — upsert one weigh-in per day and sync the profile's
 * current weight (engine targets recompute on next read). Awards
 * WEIGHT_LOG_5 at the 5th distinct entry.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()

    const rl = rateLimit(`weight:${user.id}`, 30, 60_000)
    if (!rl.allowed) {
      throw new ApiError(429, 'RATE_LIMITED', `درخواست‌های مکرر. ${rl.retryAfterSec} ثانیه دیگر تلاش کن.`)
    }

    const body = BodySchema.parse(await req.json())
    const date = body.date ?? todayIso()
    if (!isValidDayKey(date)) throw new ApiError(400, 'INVALID_DATE', 'تاریخ نامعتبر است.')

    const record = await db.weightRecord.upsert({
      where: { userId_date: { userId: user.id, date } },
      update: { weightKg: body.weightKg },
      create: { userId: user.id, date, weightKg: body.weightKg, source: 'USER' },
    })

    // Profile mirrors the latest weigh-in so the engine stays fresh.
    if (user.profile) {
      await db.userProfile.update({
        where: { userId: user.id },
        data: { currentWeightKg: body.weightKg },
      })
    }

    const count = await db.weightRecord.count({ where: { userId: user.id } })
    const awards: Awaited<ReturnType<typeof awardAchievement>>[] = []
    if (count >= 5) {
      const a = await awardAchievement(user.id, 'WEIGHT_LOG_5')
      if (a) awards.push(a)
    }

    return ok({ record: { date: record.date, weightKg: record.weightKg }, awards })
  } catch (err) {
    return handleError(err)
  }
}
