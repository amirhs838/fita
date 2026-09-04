import { NextRequest } from 'next/server'
import { handleError, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'

/** GET /api/achievements — full catalog + unlock flags (badges grid). */
export async function GET(_req: NextRequest) {
  try {
    const user = await requireUser()
    const [all, unlocked] = await Promise.all([
      db.achievement.findMany({ orderBy: { xp: 'asc' } }),
      db.userAchievement.findMany({
        where: { userId: user.id },
        select: { achievementId: true, unlockedAt: true },
      }),
    ])
    const unlockedMap = new Map(unlocked.map((u) => [u.achievementId, u.unlockedAt]))
    return ok({
      achievements: all.map((a) => ({
        code: a.code,
        titleFa: a.titleFa,
        descriptionFa: a.descriptionFa,
        icon: a.icon,
        xp: a.xp,
        category: a.category,
        unlocked: unlockedMap.has(a.id),
        unlockedAt: unlockedMap.get(a.id)?.toISOString() ?? null,
      })),
    })
  } catch (err) {
    return handleError(err)
  }
}
