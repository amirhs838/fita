import { NextRequest } from 'next/server'
import { handleError, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { computeTargets, type ActivityLevel, type ComputedTargets, type Gender, type GoalType } from '@/lib/nutrition/engine'
import { ensureStats, XP_PER_LEVEL } from '@/lib/gamification'

const pad = (n: number) => String(n).padStart(2, '0')
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/**
 * GET /api/progress — the Progress tab backbone:
 * weight journey (start→current→target), engine targets, streak/XP stats,
 * and last-7-days logging consistency. Deterministic; no AI.
 */
export async function GET(_req: NextRequest) {
  try {
    const user = await requireUser()

    const profile = user.profile
    const goal = profile?.onboardedAt
      ? await db.goal.findFirst({ where: { userId: user.id, status: 'ACTIVE' } })
      : null

    const records = await db.weightRecord.findMany({
      where: { userId: user.id },
      orderBy: { date: 'asc' },
      take: 90,
    })

    let targets: ComputedTargets | null = null
    if (profile && goal && profile.gender && profile.birthYear && profile.heightCm && profile.currentWeightKg && profile.activityLevel) {
      targets = computeTargets(
        {
          gender: profile.gender as Gender,
          age: new Date().getFullYear() - profile.birthYear,
          heightCm: profile.heightCm,
          currentWeightKg: profile.currentWeightKg,
          activityLevel: profile.activityLevel as ActivityLevel,
          pregnancy: profile.pregnancy,
          breastfeeding: profile.breastfeeding,
        },
        goal.type as GoalType,
        goal.targetWeightKg,
      )
    }

    await ensureStats(user.id)
    const stats = await db.userStats.findUnique({ where: { userId: user.id } })

    // Consistency: which of the last 7 days had ≥1 food log
    const days: { date: string; logged: boolean }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      days.push({ date: keyOf(d), logged: false })
    }
    const recentLogs = await db.foodLog.findMany({
      where: { userId: user.id, date: { gte: days[0].date } },
      select: { date: true },
      distinct: ['date'],
    })
    const loggedSet = new Set(recentLogs.map((l) => l.date))
    for (const day of days) day.logged = loggedSet.has(day.date)

    const startKg = records[0]?.weightKg ?? profile?.currentWeightKg ?? null
    const currentKg = profile?.currentWeightKg ?? records.at(-1)?.weightKg ?? null
    const targetKg = goal?.targetWeightKg ?? null

    return ok({
      weight: {
        startKg,
        currentKg,
        targetKg,
        changeKg:
          startKg !== null && currentKg !== null ? Math.round((currentKg - startKg) * 10) / 10 : null,
        records: records.map((r) => ({ date: r.date, weightKg: r.weightKg })),
      },
      targets,
      stats: {
        currentStreak: stats?.currentStreak ?? 0,
        longestStreak: stats?.longestStreak ?? 0,
        xp: stats?.xp ?? 0,
        level: stats?.level ?? 1,
        xpToNextLevel: XP_PER_LEVEL - ((stats?.xp ?? 0) % XP_PER_LEVEL),
      },
      consistency: { days },
    })
  } catch (err) {
    return handleError(err)
  }
}
