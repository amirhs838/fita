import { NextRequest } from 'next/server'
import { handleError, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { todayIso } from '@/lib/date'
import type { ReminderDto } from '@/lib/types'

const WATER_TARGET_ML = 2000
const WEIGHT_LOG_INTERVAL_DAYS = 7

/**
 * GET /api/reminders — server-computed, pref-aware due reminders for today.
 * Deterministic: time-of-day + today's real logging state decide what is due.
 * Master switch pushEnabled=false → empty list (client never invents reminders).
 * The old mealtime nudge (وقت صبحانه/ناهار/شام) was removed by product
 * decision — the meal plan is a suggestion engine, not a schedule to chase.
 */
export async function GET(_req: NextRequest) {
  try {
    const user = await requireUser()
    const date = todayIso()
    const now = new Date()
    const hour = now.getHours()

    const prefs = await db.notificationPreference.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    })
    if (!prefs.pushEnabled) {
      return ok({ reminders: [] satisfies ReminderDto[] })
    }

    const [mealCounts, waterAgg, lastWeight, stats, activePlan] = await Promise.all([
      db.foodLog.groupBy({
        by: ['mealType'],
        where: { userId: user.id, date },
        _count: { _all: true },
      }),
      db.waterLog.aggregate({ where: { userId: user.id, date }, _sum: { amountMl: true } }),
      db.weightRecord.findFirst({
        where: { userId: user.id },
        orderBy: [{ date: 'desc' }],
        select: { date: true },
      }),
      db.userStats.findUnique({ where: { userId: user.id }, select: { currentStreak: true } }),
      db.mealPlan.findFirst({ where: { userId: user.id, status: 'ACTIVE' }, select: { id: true } }),
    ])

    const totalLogsToday = mealCounts.reduce((s, m) => s + m._count._all, 0)
    const waterMl = waterAgg._sum.amountMl ?? 0

    const candidates: ReminderDto[] = []

    // Streak guard — evening, nothing logged yet, streak at risk.
    if (prefs.streakReminder && (stats?.currentStreak ?? 0) > 0 && totalLogsToday === 0 && hour >= 19) {
      candidates.push({
        id: `STREAK:${date}`,
        type: 'STREAK',
        titleFa: 'زنجیره‌ات را امشب نشکن',
        bodyFa: `زنجیره ${stats?.currentStreak ?? 0} روزه‌ات در خطر است؛ یک غذا یا میان‌وعده ثبت کن.`,
        action: 'LOG_FOOD',
      })
    }

    // Water — late afternoon, half target not reached.
    if (prefs.waterReminder && waterMl < WATER_TARGET_ML / 2 && hour >= 16 && hour < 23) {
      candidates.push({
        id: `WATER:${date}`,
        type: 'WATER',
        titleFa: 'کمی آب بخور',
        bodyFa: 'امروز آب کمتری ثبت کرده‌ای. یک لیوان آب همین حالا خالی از کار نیست.',
        action: 'LOG_WATER',
      })
    }

    // Weekly weigh-in — due when the last record is older than a week.
    if (prefs.weeklyWeightReminder && hour >= 10) {
      let due = true
      if (lastWeight) {
        const days = Math.floor((Date.now() - new Date(`${lastWeight.date}T00:00:00`).getTime()) / 86_400_000)
        due = days >= WEIGHT_LOG_INTERVAL_DAYS
      }
      if (due) {
        candidates.push({
          id: `WEIGHT:${date}`,
          type: 'WEIGHT',
          titleFa: 'وقت توزین هفتگی',
          bodyFa: 'وزن امروزت را ثبت کن تا روند پیشرفتت دقیق بماند.',
          action: 'LOG_WEIGHT',
        })
      }
    }

    // Plan suggestion — onboarded users without an active weekly plan.
    if (!activePlan && hour >= 9) {
      candidates.push({
        id: `PLAN:${date}`,
        type: 'PLAN',
        titleFa: 'برنامه غذایی این هفته',
        bodyFa: 'هنوز برنامه 7روزه نساخته‌ای. بگذار فیتا طبق هدف و سلیقه‌ات بچیند.',
        action: 'OPEN_PLAN',
      })
    }

    // Priority order, max 3 so the dashboard never feels naggy.
    const order: Record<ReminderDto['type'], number> = { MEAL: 0, STREAK: 1, WATER: 2, WEIGHT: 3, PLAN: 4 }
    const reminders = candidates.sort((a, b) => order[a.type] - order[b.type]).slice(0, 3)
    return ok({ reminders })
  } catch (err) {
    return handleError(err)
  }
}
