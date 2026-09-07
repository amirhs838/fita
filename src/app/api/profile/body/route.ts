import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ApiError, handleError, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { todayIso } from '@/lib/date'
import { db } from '@/lib/db'
import { awardAchievement } from '@/lib/gamification'

/**
 * POST /api/profile/body — edit the body profile from the Profile tab.
 *
 * - heightCm → UserProfile (targets recompute on next read)
 * - weightKg → today's WeightRecord upsert + profile mirror (same contract
 *   as POST /api/weight, incl. the WEIGHT_LOG_5 award)
 * - waist/hip/neck/arm/thigh → today's BodyMeasurement row (merged — fields
 *   not sent keep their stored values)
 *
 * Body-fat % is never stored: it is derived on read via Navy→RFM so edited
 * measurements instantly re-estimate without stale duplicated values.
 */
const BodySchema = z
  .object({
    heightCm: z.number().min(100).max(230).optional(),
    weightKg: z.number().min(35).max(250).optional(),
    waistCm: z.number().min(40).max(200).optional(),
    hipCm: z.number().min(50).max(200).optional(),
    neckCm: z.number().min(20).max(60).optional(),
    armCm: z.number().min(15).max(70).optional(),
    thighCm: z.number().min(20).max(120).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'حداقل یک مقدار لازم است.',
  })

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()

    const rl = rateLimit(`profile-body:${user.id}`, 30, 60_000)
    if (!rl.allowed) {
      throw new ApiError(429, 'RATE_LIMITED', `درخواست‌های مکرر. ${rl.retryAfterSec} ثانیه دیگر تلاش کن.`)
    }

    const body = BodySchema.parse(await req.json())
    const date = todayIso()

    // 1) Height — profile-level fact.
    if (body.heightCm !== undefined) {
      if (user.profile) {
        await db.userProfile.update({ where: { userId: user.id }, data: { heightCm: body.heightCm } })
      } else {
        await db.userProfile.create({ data: { userId: user.id, heightCm: body.heightCm } })
      }
    }

    // 2) Weight — one weigh-in per day, mirrored onto the profile.
    if (body.weightKg !== undefined) {
      await db.weightRecord.upsert({
        where: { userId_date: { userId: user.id, date } },
        update: { weightKg: body.weightKg },
        create: { userId: user.id, date, weightKg: body.weightKg, source: 'USER' },
      })
      if (user.profile) {
        await db.userProfile.update({
          where: { userId: user.id },
          data: { currentWeightKg: body.weightKg },
        })
      }
    }

    // 3) Circumferences — merged into today's measurement row.
    const circ = {
      waistCm: body.waistCm,
      hipCm: body.hipCm,
      neckCm: body.neckCm,
      armCm: body.armCm,
      thighCm: body.thighCm,
    }
    const hasCirc = Object.values(circ).some((v) => v !== undefined)
    if (hasCirc) {
      const existing = await db.bodyMeasurement.findFirst({
        where: { userId: user.id, date },
        orderBy: { createdAt: 'desc' },
      })
      if (existing) {
        await db.bodyMeasurement.update({ where: { id: existing.id }, data: { ...circ } })
      } else {
        await db.bodyMeasurement.create({ data: { userId: user.id, date, ...circ } })
      }
    }

    // Weight logging award parity with POST /api/weight.
    const awards: Awaited<ReturnType<typeof awardAchievement>>[] = []
    if (body.weightKg !== undefined) {
      const count = await db.weightRecord.count({ where: { userId: user.id } })
      if (count >= 5) {
        const a = await awardAchievement(user.id, 'WEIGHT_LOG_5')
        if (a) awards.push(a)
      }
    }

    const [freshProfile, measurement] = await Promise.all([
      db.userProfile.findUnique({
        where: { userId: user.id },
        select: { heightCm: true, currentWeightKg: true },
      }),
      db.bodyMeasurement.findFirst({
        where: { userId: user.id, date },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    return ok({
      profile: freshProfile,
      measurement: measurement
        ? {
            date: measurement.date,
            waistCm: measurement.waistCm,
            hipCm: measurement.hipCm,
            neckCm: measurement.neckCm,
            armCm: measurement.armCm,
            thighCm: measurement.thighCm,
          }
        : null,
      awards,
    })
  } catch (err) {
    return handleError(err)
  }
}
