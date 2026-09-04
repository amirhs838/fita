import { NextRequest } from 'next/server'
import { ApiError, handleError, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { onboardingSchema } from '@/lib/onboarding-schema'
import { computeTargets, validateTargetWeight, ENGINE_METHOD, type GoalType } from '@/lib/nutrition/engine'
import { db } from '@/lib/db'

/**
 * POST /api/profile/onboarding
 * Persists the full onboarding payload and computes goal targets with the
 * deterministic Nutrition Engine (never AI). Unsafe targets are hard-rejected.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()

    const rl = rateLimit(`onboarding:${user.id}`, 10, 60_000)
    if (!rl.allowed) {
      throw new ApiError(429, 'RATE_LIMITED', `درخواست‌های مکرر. ${rl.retryAfterSec} ثانیه دیگر تلاش کن.`)
    }

    const input = onboardingSchema.parse(await req.json())

    // Server-side safety validation of the goal target.
    if (input.targetWeightKg != null) {
      const check = validateTargetWeight({
        gender: input.gender,
        heightCm: input.heightCm,
        currentWeightKg: input.currentWeightKg,
        targetWeightKg: input.targetWeightKg,
        goalType: input.goalType as GoalType,
      })
      if (!check.ok) {
        throw new ApiError(422, 'UNSAFE_TARGET', check.warnings[0] ?? 'وزن هدف نامناسب است.')
      }
    }

    const birthYear = new Date().getFullYear() - input.age
    const targets = computeTargets(
      {
        gender: input.gender,
        age: input.age,
        heightCm: input.heightCm,
        currentWeightKg: input.currentWeightKg,
        activityLevel: input.activityLevel,
        pregnancy: input.pregnancy,
        breastfeeding: input.breastfeeding,
      },
      input.goalType as GoalType,
      input.targetWeightKg,
    )

    const profileData = {
      gender: input.gender,
      birthYear,
      heightCm: input.heightCm,
      currentWeightKg: input.currentWeightKg,
      activityLevel: input.activityLevel,
      mealsPerDay: input.mealsPerDay,
      budgetLevel: input.budgetLevel,
      pregnancy: input.pregnancy,
      breastfeeding: input.breastfeeding,
      medications: input.medications,
      medicalNotes: input.medicalNotes,
      likedFoodsJson: input.likedFoods.length ? JSON.stringify(input.likedFoods) : null,
      onboardedAt: new Date(),
    }

    await db.$transaction(async (tx) => {
      // The display name collected in the wizard belongs on the user record.
      await tx.user.update({ where: { id: user.id }, data: { name: input.name } })
      await tx.userProfile.upsert({
        where: { userId: user.id },
        update: profileData,
        create: { userId: user.id, ...profileData },
      })

      // Mirror the starting weight as the first weight record.
      await tx.weightRecord.upsert({
        where: { userId_date: { userId: user.id, date: input.today } },
        update: { weightKg: input.currentWeightKg },
        create: {
          userId: user.id,
          date: input.today,
          weightKg: input.currentWeightKg,
          source: 'ONBOARDING',
        },
      })

      // Optional body measurements → first time-series entry.
      if (input.measurements) {
        const m = input.measurements
        await tx.bodyMeasurement.create({
          data: {
            userId: user.id,
            date: input.today,
            waistCm: m.waistCm,
            hipCm: m.hipCm,
            neckCm: m.neckCm,
            armCm: m.armCm,
            thighCm: m.thighCm,
            wristCm: m.wristCm,
          },
        })
      }

      // Replace preference sets atomically.
      await tx.allergy.deleteMany({ where: { userId: user.id } })
      for (const name of input.allergies) {
        await tx.allergy.create({ data: { userId: user.id, name } }).catch(() => null)
      }

      await tx.dislikedFood.deleteMany({ where: { userId: user.id } })
      for (const name of input.dislikedFoods) {
        await tx.dislikedFood.create({ data: { userId: user.id, name } }).catch(() => null)
      }

      await tx.dietPreference.deleteMany({ where: { userId: user.id } })
      for (const tag of input.dietPreferences) {
        await tx.dietPreference.create({ data: { userId: user.id, tag } }).catch(() => null)
      }

      // Archive old goals, create the active one with engine snapshot.
      await tx.goal.updateMany({
        where: { userId: user.id, status: 'ACTIVE' },
        data: { status: 'ARCHIVED', archivedAt: new Date() },
      })
      await tx.goal.create({
        data: {
          userId: user.id,
          type: input.goalType,
          targetWeightKg: input.targetWeightKg,
          status: 'ACTIVE',
          kcalTarget: targets.kcal,
          proteinTargetG: targets.proteinG,
          carbTargetG: targets.carbG,
          fatTargetG: targets.fatG,
          fiberTargetG: targets.fiberG,
          method: ENGINE_METHOD,
        },
      })

      await tx.analyticsEvent.create({
        data: { userId: user.id, name: 'onboarding_completed' },
      })
    })

    return ok({ targets })
  } catch (err) {
    return handleError(err)
  }
}
