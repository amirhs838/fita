import { NextRequest, NextResponse } from 'next/server'
import { handleError, ApiError } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { todayIso } from '@/lib/date'
import { db } from '@/lib/db'

/**
 * GET /api/account/export — data portability (Phase 12 privacy).
 * Streams every stored piece of data that belongs to the session user as a
 * downloadable JSON file. Read-only: nothing is mutated, nothing is deleted.
 * Rate-limited: 3/min (payload can be large).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser()

    const rl = rateLimit(`export:${user.id}`, 3, 60_000)
    if (!rl.allowed) {
      throw new ApiError(429, 'RATE_LIMITED', `درخواست‌های مکرر. ${rl.retryAfterSec} ثانیه دیگر تلاش کن.`)
    }

    const [
      profile,
      goals,
      weights,
      measurements,
      allergies,
      dislikedFoods,
      dietPreferences,
      favoriteFoods,
      foodLogs,
      waterLogs,
      mealPlans,
      conversations,
      achievements,
      stats,
      subscription,
      notificationPrefs,
    ] = await Promise.all([
      db.userProfile.findUnique({ where: { userId: user.id } }),
      db.goal.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } }),
      db.weightRecord.findMany({ where: { userId: user.id }, orderBy: { date: 'asc' } }),
      db.bodyMeasurement.findMany({ where: { userId: user.id }, orderBy: { date: 'asc' } }),
      db.allergy.findMany({ where: { userId: user.id } }),
      db.dislikedFood.findMany({ where: { userId: user.id } }),
      db.dietPreference.findMany({ where: { userId: user.id } }),
      db.favoriteFood.findMany({
        where: { userId: user.id },
        include: { food: { select: { nameFa: true, category: true } } },
      }),
      db.foodLog.findMany({
        where: { userId: user.id },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        include: { items: true },
      }),
      db.waterLog.findMany({ where: { userId: user.id }, orderBy: { date: 'asc' } }),
      db.mealPlan.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
        include: { days: { orderBy: { dayIndex: 'asc' }, include: { items: true } } },
      }),
      db.aIConversation.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      }),
      db.userAchievement.findMany({
        where: { userId: user.id },
        include: { achievement: true },
      }),
      db.userStats.findUnique({ where: { userId: user.id } }),
      db.subscription.findUnique({ where: { userId: user.id } }),
      db.notificationPreference.findUnique({ where: { userId: user.id } }),
    ])

    const payload = {
      app: 'fita',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      account: {
        phone: user.phone,
        name: user.name,
        createdAt: user.createdAt,
      },
      profile: profile
        ? {
            gender: profile.gender,
            birthYear: profile.birthYear,
            heightCm: profile.heightCm,
            currentWeightKg: profile.currentWeightKg,
            activityLevel: profile.activityLevel,
            mealsPerDay: profile.mealsPerDay,
            budgetLevel: profile.budgetLevel,
            pregnancy: profile.pregnancy,
            breastfeeding: profile.breastfeeding,
            medicalNotes: profile.medicalNotes,
            likedFoods: safeParse(profile.likedFoodsJson),
            onboardedAt: profile.onboardedAt,
          }
        : null,
      goals: goals.map((g) => ({
        type: g.type,
        targetWeightKg: g.targetWeightKg,
        paceKgPerWeek: g.paceKgPerWeek,
        status: g.status,
        targets: {
          kcal: g.kcalTarget,
          proteinG: g.proteinTargetG,
          carbG: g.carbTargetG,
          fatG: g.fatTargetG,
          fiberG: g.fiberTargetG,
        },
        method: g.method,
        createdAt: g.createdAt,
      })),
      bodyMeasurements: measurements,
      weights: weights.map((w) => ({ date: w.date, weightKg: w.weightKg, source: w.source })),
      allergies: allergies.map((a) => ({ name: a.name, severity: a.severity })),
      dislikedFoods: dislikedFoods.map((d) => d.name),
      dietPreferences: dietPreferences.map((d) => d.tag),
      favoriteFoods: favoriteFoods.map((f) => ({ nameFa: f.food.nameFa, category: f.food.category })),
      foodLogs: foodLogs.map((l) => ({
        date: l.date,
        mealType: l.mealType,
        source: l.source,
        note: l.note,
        createdAt: l.createdAt,
        items: l.items.map((it) => ({
          nameFa: it.nameFa,
          grams: it.grams,
          servingLabel: it.servingLabel,
          kcal: it.kcal,
          proteinG: it.proteinG,
          carbsG: it.carbsG,
          fatG: it.fatG,
        })),
      })),
      waterLogs: waterLogs.map((w) => ({ date: w.date, amountMl: w.amountMl, createdAt: w.createdAt })),
      mealPlans: mealPlans.map((p) => ({
        startDate: p.startDate,
        endDate: p.endDate,
        status: p.status,
        targets: safeParse(p.targetsJson),
        createdAt: p.createdAt,
        days: p.days.map((d) => ({
          date: d.date,
          dayIndex: d.dayIndex,
          items: d.items.map((it) => ({
            mealType: it.mealType,
            titleFa: it.titleFa,
            grams: it.grams,
            servingLabel: it.servingLabel,
            kcal: it.kcal,
            proteinG: it.proteinG,
            carbsG: it.carbsG,
            fatG: it.fatG,
            status: it.status,
          })),
        })),
      })),
      coachConversations: conversations.map((c) => ({
        title: c.title,
        createdAt: c.createdAt,
        messages: c.messages.map((m) => ({
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        })),
      })),
      achievements: achievements.map((a) => ({
        code: a.achievement.code,
        titleFa: a.achievement.titleFa,
        xp: a.achievement.xp,
        unlockedAt: a.unlockedAt,
      })),
      stats: stats
        ? {
            currentStreak: stats.currentStreak,
            longestStreak: stats.longestStreak,
            xp: stats.xp,
            level: stats.level,
            lastLogDate: stats.lastLogDate,
          }
        : null,
      subscription: subscription
        ? {
            tier: subscription.tier,
            trialStartedAt: subscription.trialStartedAt,
            trialEndsAt: subscription.trialEndsAt,
            scansUsed: subscription.scansUsed,
            scansLimit: subscription.scansLimit,
            proStartedAt: subscription.proStartedAt,
            proExpiresAt: subscription.proExpiresAt,
          }
        : null,
      notificationPreferences: notificationPrefs
        ? {
            pushEnabled: notificationPrefs.pushEnabled,
            mealReminder: notificationPrefs.mealReminder,
            mealTimes: safeParse(notificationPrefs.mealTimesJson),
            waterReminder: notificationPrefs.waterReminder,
            weeklyWeightReminder: notificationPrefs.weeklyWeightReminder,
            streakReminder: notificationPrefs.streakReminder,
            weeklySummary: notificationPrefs.weeklySummary,
          }
        : null,
    }

    const body = JSON.stringify(payload, null, 2)
    const filename = `fita-export-${todayIso()}.json`

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    return handleError(err)
  }
}

function safeParse(json: string | null | undefined): unknown {
  if (!json) return null
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}
