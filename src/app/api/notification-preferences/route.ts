import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ApiError, handleError, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { db } from '@/lib/db'
import { DEFAULT_MEAL_TIMES } from '@/lib/config'

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const PatchSchema = z
  .object({
    pushEnabled: z.boolean(),
    mealReminder: z.boolean(),
    /** "HH:MM" list, unique, 1..6 entries */
    mealTimes: z
      .array(z.string().regex(TIME_RE, 'ساعت باید به شکل HH:MM باشد'))
      .min(1)
      .max(6),
    waterReminder: z.boolean(),
    weeklyWeightReminder: z.boolean(),
    streakReminder: z.boolean(),
    weeklySummary: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'empty' })
  .refine(
    (v) => !v.mealTimes || new Set([...v.mealTimes].sort()).size === v.mealTimes.length,
    { message: 'duplicate meal times' },
  )

function prefsDto(row: {
  pushEnabled: boolean
  mealReminder: boolean
  mealTimesJson: string | null
  waterReminder: boolean
  weeklyWeightReminder: boolean
  streakReminder: boolean
  weeklySummary: boolean
}) {
  let mealTimes: string[] = []
  try {
    const parsed = row.mealTimesJson ? (JSON.parse(row.mealTimesJson) as unknown) : []
    if (Array.isArray(parsed)) {
      mealTimes = parsed.filter((t): t is string => typeof t === 'string' && TIME_RE.test(t))
    }
  } catch {
    mealTimes = []
  }
  if (mealTimes.length === 0) {
    mealTimes = [...DEFAULT_MEAL_TIMES]
  }
  return {
    pushEnabled: row.pushEnabled,
    mealReminder: row.mealReminder,
    mealTimes,
    waterReminder: row.waterReminder,
    weeklyWeightReminder: row.weeklyWeightReminder,
    streakReminder: row.streakReminder,
    weeklySummary: row.weeklySummary,
  }
}

/** GET /api/notification-preferences — current reminder settings (creates defaults). */
export async function GET() {
  try {
    const user = await requireUser()
    const row = await db.notificationPreference.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    })
    return ok(prefsDto(row))
  } catch (err) {
    return handleError(err)
  }
}

/** PATCH /api/notification-preferences — partial update, zod-validated. */
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser()

    const rl = rateLimit(`notif-prefs:${user.id}`, 20, 60_000)
    if (!rl.allowed) {
      throw new ApiError(429, 'RATE_LIMITED', `درخواست‌های مکرر. ${rl.retryAfterSec} ثانیه دیگر تلاش کن.`)
    }

    const patch = PatchSchema.parse(await req.json())

    const data: Record<string, unknown> = {}
    if (patch.pushEnabled !== undefined) data.pushEnabled = patch.pushEnabled
    if (patch.mealReminder !== undefined) data.mealReminder = patch.mealReminder
    if (patch.mealTimes !== undefined) {
      data.mealTimesJson = JSON.stringify([...patch.mealTimes].sort())
    }
    if (patch.waterReminder !== undefined) data.waterReminder = patch.waterReminder
    if (patch.weeklyWeightReminder !== undefined)
      data.weeklyWeightReminder = patch.weeklyWeightReminder
    if (patch.streakReminder !== undefined) data.streakReminder = patch.streakReminder
    if (patch.weeklySummary !== undefined) data.weeklySummary = patch.weeklySummary

    const row = await db.notificationPreference.upsert({
      where: { userId: user.id },
      update: data,
      create: { userId: user.id, ...data },
    })
    return ok(prefsDto(row))
  } catch (err) {
    return handleError(err)
  }
}
