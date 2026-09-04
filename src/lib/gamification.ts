import { db } from '@/lib/db'
import { todayIso } from '@/lib/date'

/**
 * Gamification core (Phase 9):
 *  - XP for healthy behaviors; level = 1 + floor(xp/200)
 *  - Streak = consecutive days (ending today or yesterday) with ≥1 food log
 *  - Achievements are idempotent unlocks that grant their XP
 *  - Leaderboard is BEHAVIOR-ONLY (logs/water/plan actions) — never body weight
 * Leaderboard periods use string keys (WEEKLY:ISOweek / MONTHLY:YYYY-MM).
 */

export const XP_PER_LEVEL = 200

export function levelForXp(xp: number): number {
  return 1 + Math.floor(Math.max(0, xp) / XP_PER_LEVEL)
}

/** ISO-8601 week key, e.g. 2026-W35 (weeks start Monday; UTC-free, local-safe). */
export function weekKey(d = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7 // Mon=1..Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum) // Thursday of this week
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function addXp(userId: string, amount: number): Promise<void> {
  if (amount <= 0) return
  const stats = await db.userStats.upsert({
    where: { userId },
    update: { xp: { increment: amount } },
    create: { userId, xp: amount, level: 1 },
  })
  const level = levelForXp(stats.xp)
  if (level !== stats.level) {
    await db.userStats.update({ where: { userId }, data: { level } })
  }
}

export interface AwardedDto {
  code: string
  titleFa: string
  descriptionFa: string
  icon: string | null
  xp: number
}

/**
 * Idempotent unlock: grants XP on first unlock only. Returns the achievement
 * DTO when newly awarded (so APIs can surface a toast), otherwise null.
 */
export async function awardAchievement(userId: string, code: string): Promise<AwardedDto | null> {
  const achievement = await db.achievement.findUnique({ where: { code } })
  if (!achievement) return null
  const created = await db.userAchievement
    .create({ data: { userId, achievementId: achievement.id } })
    .catch(() => null) // already unlocked → unique constraint
  if (!created) return null
  await addXp(userId, achievement.xp)
  return {
    code: achievement.code,
    titleFa: achievement.titleFa,
    descriptionFa: achievement.descriptionFa,
    icon: achievement.icon,
    xp: achievement.xp,
  }
}

/** Recompute the food-log streak and sync streak achievements. Returns new awards. */
export async function syncStreak(userId: string): Promise<AwardedDto[]> {
  const today = todayIso()
  const since = new Date()
  since.setDate(since.getDate() - 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  const sinceKey = `${since.getFullYear()}-${pad(since.getMonth() + 1)}-${pad(since.getDate())}`

  const logs = await db.foodLog.findMany({
    where: { userId, date: { gte: sinceKey } },
    select: { date: true },
    distinct: ['date'],
    orderBy: { date: 'desc' },
  })
  const dates = new Set(logs.map((l) => l.date))

  // Count back from today (or yesterday if today not yet logged).
  let streak = 0
  const cursor = new Date()
  if (!dates.has(today)) cursor.setDate(cursor.getDate() - 1)
  for (;;) {
    const key = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`
    if (!dates.has(key)) break
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }

  await db.userStats.upsert({
    where: { userId },
    update: { currentStreak: streak, lastLogDate: dates.has(today) ? today : undefined },
    create: { userId, currentStreak: streak },
  })
  await db.userStats.update({
    where: { userId },
    data: { longestStreak: { set: Math.max(streak, (await db.userStats.findUniqueOrThrow({ where: { userId } })).longestStreak) } },
  })

  const awards: AwardedDto[] = []
  if (streak >= 3) {
    const a = await awardAchievement(userId, 'STREAK_3')
    if (a) awards.push(a)
  }
  if (streak >= 7) {
    const a = await awardAchievement(userId, 'STREAK_7')
    if (a) awards.push(a)
  }
  return awards
}

/** Behavior points for the weekly/monthly leaderboard (never body weight). */
export async function bumpLeaderboard(userId: string, points: number): Promise<void> {
  if (points <= 0) return
  for (const [period, key] of [
    ['WEEKLY', weekKey()],
    ['MONTHLY', monthKey()],
  ] as const) {
    const periodKey = `${period}:${key}`
    await db.leaderboardRecord.upsert({
      where: { userId_period: { userId, period: periodKey } },
      update: { score: { increment: points }, computedAt: new Date() },
      create: { userId, period: periodKey, score: points },
    })
  }
}

export async function ensureStats(userId: string) {
  await db.userStats.upsert({ where: { userId }, update: {}, create: { userId } })
}
