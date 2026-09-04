import { getSessionUser } from '@/lib/auth'
import { fail, handleError, ok } from '@/lib/api'
import { db } from '@/lib/db'
import { syncSubscriptionTier } from '@/lib/subscription/service'

export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user || user.status !== 'ACTIVE') {
      return fail(401, 'UNAUTHENTICATED', 'ابتدا وارد حساب شو.')
    }

    // Lazy tier sync so the client sees EXPIRED as soon as the trial/PRO ends.
    await syncSubscriptionTier(user.id)
    const freshSub = await db.subscription.findUnique({ where: { userId: user.id } })

    const activeGoal = user.profile?.onboardedAt
      ? await db.goal.findFirst({
          where: { userId: user.id, status: 'ACTIVE' },
          select: { type: true, targetWeightKg: true },
        })
      : null

    return ok({
      user: { id: user.id, phone: user.phone, name: user.name },
      profile: user.profile
        ? {
            gender: user.profile.gender,
            heightCm: user.profile.heightCm,
            currentWeightKg: user.profile.currentWeightKg,
            activityLevel: user.profile.activityLevel,
            mealsPerDay: user.profile.mealsPerDay,
            budgetLevel: user.profile.budgetLevel,
          }
        : null,
      onboarded: Boolean(user.profile?.onboardedAt),
      goal: activeGoal ? { type: activeGoal.type, targetWeightKg: activeGoal.targetWeightKg } : null,
      subscription: {
        tier: freshSub?.tier ?? user.subscription?.tier ?? 'FREE_TRIAL',
        trialEndsAt:
          freshSub?.trialEndsAt?.toISOString() ?? user.subscription?.trialEndsAt?.toISOString() ?? null,
        proExpiresAt: freshSub?.proExpiresAt?.toISOString() ?? null,
        scansUsed: freshSub?.scansUsed ?? user.subscription?.scansUsed ?? 0,
        scansLimit: freshSub?.scansLimit ?? user.subscription?.scansLimit ?? 0,
      },
      stats: {
        currentStreak: user.stats?.currentStreak ?? 0,
        xp: user.stats?.xp ?? 0,
        level: user.stats?.level ?? 1,
      },
    })
  } catch (err) {
    return handleError(err)
  }
}
