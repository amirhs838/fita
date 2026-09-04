import { db } from '@/lib/db'
import { AppConfig } from '@/lib/config'

const DAY_MS = 24 * 60 * 60 * 1000

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

/**
 * Ensure a user has the 1:1 side-rows created at signup.
 * Kept idempotent so it can be safely re-run.
 */
export async function ensureUserDependencies(userId: string) {
  await Promise.all([
    db.subscription.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        tier: 'FREE_TRIAL',
        trialStartedAt: new Date(),
        trialEndsAt: addDays(new Date(), AppConfig.trial.days),
        scansLimit: AppConfig.trial.scanLimit,
      },
    }),
    db.userStats.upsert({ where: { userId }, update: {}, create: { userId } }),
    db.notificationPreference.upsert({ where: { userId }, update: {}, create: { userId } }),
  ])
}
