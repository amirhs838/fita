import { NextRequest } from 'next/server'
import { ApiError, handleError, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { estimateBodyFat } from '@/lib/nutrition/bodyComposition'
import { todayIso } from '@/lib/date'
import type { Gender } from '@/lib/nutrition/engine'
import type { TrendPoint, TrendRange } from '@/lib/types'

/** Range → lookback window (inclusive days) + series granularity. */
const RANGES: Record<TrendRange, { days: number; bucket: 'day' | 'week' | 'month' }> = {
  '1w': { days: 7, bucket: 'day' },
  '1m': { days: 30, bucket: 'day' },
  '3m': { days: 91, bucket: 'week' },
  '6m': { days: 182, bucket: 'week' },
  '1y': { days: 365, bucket: 'month' },
}

const pad = (n: number) => String(n).padStart(2, '0')
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const round1 = (n: number) => Math.round(n * 10) / 10

/** Iranian week — buckets align to Saturday (the first day of the week). */
function saturdayKeyOf(d: Date): string {
  const daysSinceSaturday = (d.getDay() + 1) % 7
  const s = new Date(d)
  s.setDate(d.getDate() - daysSinceSaturday)
  return keyOf(s)
}

const r1 = (v: number | null | undefined): number | null => (v == null ? null : round1(v))

/**
 * GET /api/progress/trends?range=1w|1m|3m|6m|1y
 *
 * Range-aware series for the Progress tab charts:
 * - weight:   actual weigh-ins in the window (time-domain positions)
 * - bodyFat:  per BodyMeasurement row via Navy→RFM (points only where the
 *             tape data supports an estimate — never fabricated)
 * - calories: per-day intake from FoodLog items; weekly/monthly buckets are
 *             the mean of logged days inside the bucket (empty buckets are
 *             skipped so sparse weeks don't read as fasting)
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser()

    const rangeParam = req.nextUrl.searchParams.get('range') ?? '1m'
    if (!(rangeParam in RANGES)) throw new ApiError(400, 'INVALID_RANGE', 'بازه زمانی نامعتبر است.')
    const range = rangeParam as TrendRange
    const { days, bucket } = RANGES[range]

    const end = todayIso()
    const endDate = new Date()
    endDate.setDate(endDate.getDate() - (days - 1))
    const start = keyOf(endDate)

    const profile = user.profile
    const gender = (profile?.gender ?? null) as Gender | null
    const heightCm = profile?.heightCm ?? null

    const [weights, measurements, foodLogs, goal] = await Promise.all([
      db.weightRecord.findMany({
        where: { userId: user.id, date: { gte: start } },
        orderBy: { date: 'asc' },
        select: { date: true, weightKg: true },
      }),
      db.bodyMeasurement.findMany({
        where: { userId: user.id, date: { gte: start } },
        orderBy: { date: 'asc' },
        select: { date: true, waistCm: true, hipCm: true, neckCm: true },
      }),
      db.foodLog.findMany({
        where: { userId: user.id, date: { gte: start } },
        select: { date: true, items: { select: { kcal: true } } },
      }),
      db.goal.findFirst({
        where: { userId: user.id, status: 'ACTIVE' },
        select: { type: true, targetWeightKg: true, kcalTarget: true },
      }),
    ])

    const weightPoints: TrendPoint[] = weights.map((w) => ({ date: w.date, value: round1(w.weightKg) }))

    const bodyFatPoints: TrendPoint[] = []
    if (gender && heightCm) {
      for (const m of measurements) {
        if (!m.waistCm) continue
        const est = estimateBodyFat(gender, heightCm, { waistCm: m.waistCm, hipCm: m.hipCm, neckCm: m.neckCm })
        if (est) bodyFatPoints.push({ date: m.date, value: round1(est.pct) })
      }
    }

    // Daily intake map (only logged days exist).
    const daily = new Map<string, number>()
    for (const log of foodLogs) {
      let sum = 0
      for (const item of log.items) sum += item.kcal
      daily.set(log.date, (daily.get(log.date) ?? 0) + sum)
    }

    let caloriePoints: TrendPoint[]
    if (bucket === 'day') {
      caloriePoints = [...daily.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([date, kcal]) => ({ date, value: Math.round(kcal) }))
    } else {
      const buckets = new Map<string, { sum: number; n: number }>()
      for (const [date, kcal] of daily) {
        const d = new Date(`${date}T12:00:00`)
        const key = bucket === 'week' ? saturdayKeyOf(d) : `${date.slice(0, 7)}-01`
        const b = buckets.get(key) ?? { sum: 0, n: 0 }
        b.sum += kcal
        b.n += 1
        buckets.set(key, b)
      }
      caloriePoints = [...buckets.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([date, b]) => ({ date, value: Math.round(b.sum / b.n) }))
    }

    const loggedKcals = [...daily.values()]
    const avgKcal = loggedKcals.length
      ? Math.round(loggedKcals.reduce((s, v) => s + v, 0) / loggedKcals.length)
      : null

    return ok({
      range,
      start,
      end,
      bucket,
      goalType: goal?.type ?? null,
      weight: {
        points: weightPoints,
        targetKg: r1(goal?.targetWeightKg),
        currentKg: r1(profile?.currentWeightKg),
      },
      bodyFat: { points: bodyFatPoints },
      calories: {
        points: caloriePoints,
        targetKcal: goal?.kcalTarget ?? null,
        avgKcal,
        loggedDays: loggedKcals.length,
      },
    })
  } catch (err) {
    return handleError(err)
  }
}
