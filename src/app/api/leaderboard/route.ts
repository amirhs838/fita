import { NextRequest } from 'next/server'
import { handleError, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { monthKey, weekKey } from '@/lib/gamification'

/**
 * GET /api/leaderboard?period=weekly|monthly
 * BEHAVIOR-ONLY composite (logged days, scans, water-goal days, plan actions).
 * Body weight is never ranked — the schema forbids it. Privacy: display names
 * are first names + initial (سارا ر.); signed-in users have no public profile.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser()
    const periodParam = req.nextUrl.searchParams.get('period') ?? 'weekly'
    const [period, key] =
      periodParam === 'monthly' ? (['MONTHLY', monthKey()] as const) : (['WEEKLY', weekKey()] as const)
    const periodKey = `${period}:${key}`

    const rows = await db.leaderboardRecord.findMany({
      where: { period: periodKey },
      orderBy: { score: 'desc' },
      take: 20,
      include: { user: { select: { id: true, name: true } } },
    })

    const meIndex = rows.findIndex((r) => r.userId === user.id)
    const displayName = (name: string | null) => {
      const n = (name ?? 'کاربر').trim().split(/\s+/)[0] || 'کاربر'
      return `${n} ${n[0]}.`
    }

    return ok({
      period: periodParam,
      entries: rows.map((r, i) => ({
        rank: i + 1,
        userId: r.userId,
        name: displayName(r.user.name),
        score: Math.round(r.score),
        isMe: r.userId === user.id,
      })),
      myRank: meIndex >= 0 ? meIndex + 1 : null,
      myScore:
        meIndex >= 0
          ? Math.round(rows[meIndex].score)
          : Math.round(
              (await db.leaderboardRecord.findUnique({
                where: { userId_period: { userId: user.id, period: periodKey } },
              }))?.score ?? 0,
            ),
    })
  } catch (err) {
    return handleError(err)
  }
}
