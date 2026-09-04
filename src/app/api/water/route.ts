import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ApiError, handleError, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { isValidDayKey, todayIso } from '@/lib/date'
import { db } from '@/lib/db'
import { awardAchievement, bumpLeaderboard } from '@/lib/gamification'

const WATER_GOAL_ML = 2000

const PostSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(''),
  amountMl: z.number().int().min(50).max(2000),
})

/** POST /api/water — append a water entry for a day. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()

    const rl = rateLimit(`water:${user.id}`, 60, 60_000)
    if (!rl.allowed) {
      throw new ApiError(429, 'RATE_LIMITED', `درخواست‌های مکرر. ${rl.retryAfterSec} ثانیه دیگر تلاش کن.`)
    }

    const { date: rawDate, amountMl } = PostSchema.parse(await req.json())
    const date = rawDate || todayIso()
    if (!isValidDayKey(date)) throw new ApiError(400, 'INVALID_DATE', 'تاریخ نامعتبر است.')

    await db.waterLog.create({ data: { userId: user.id, date, amountMl } })
    const totalRaw = await db.waterLog.aggregate({
      where: { userId: user.id, date },
      _sum: { amountMl: true },
    })
    const total = totalRaw._sum.amountMl ?? 0

    // Water-goal achievement (crossing 2000ml) — idempotent, never blocks.
    const awards: Awaited<ReturnType<typeof awardAchievement>>[] = []
    if (total >= WATER_GOAL_ML) {
      try {
        const a = await awardAchievement(user.id, 'WATER_DAY')
        if (a) awards.push(a)
        await bumpLeaderboard(user.id, 15)
      } catch (e) {
        console.error('[gamification] water hook failed:', e)
      }
    }

    return ok({ date, waterMl: total, awards })
  } catch (err) {
    return handleError(err)
  }
}

/** DELETE /api/water?date= — undo: removes the most recent entry of the day. */
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser()
    const date = req.nextUrl.searchParams.get('date') || todayIso()
    if (!isValidDayKey(date)) throw new ApiError(400, 'INVALID_DATE', 'تاریخ نامعتبر است.')

    const last = await db.waterLog.findFirst({
      where: { userId: user.id, date },
      orderBy: { createdAt: 'desc' },
    })
    if (!last) return ok({ date, waterMl: 0 })

    await db.waterLog.delete({ where: { id: last.id } })
    const total = await db.waterLog.aggregate({
      where: { userId: user.id, date },
      _sum: { amountMl: true },
    })
    return ok({ date, waterMl: total._sum.amountMl ?? 0 })
  } catch (err) {
    return handleError(err)
  }
}
