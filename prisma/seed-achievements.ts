import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Achievement catalog — idempotent (safe to re-run).
 * XP doubles as the badge's reward; streaks/behaviors unlock the rest.
 */
const ACHIEVEMENTS = [
  { code: 'FIRST_MEAL', titleFa: 'اولین ثبت', descriptionFa: 'اولین غذای خودت را ثبت کردی', icon: '🍽️', xp: 20, category: 'GENERAL' },
  { code: 'FIRST_SCAN', titleFa: 'چشم هوشمند', descriptionFa: 'اولین اسکن عکس غذا', icon: '📸', xp: 30, category: 'SCAN' },
  { code: 'FIRST_PLAN', titleFa: 'برنامه‌ریز', descriptionFa: 'اولین برنامه هفتگی‌ات را ساختی', icon: '🗓️', xp: 30, category: 'PLAN' },
  { code: 'WATER_DAY', titleFa: 'آب‌شناس', descriptionFa: 'یک روز کامل 8 لیوان آب', icon: '💧', xp: 30, category: 'HEALTH' },
  { code: 'STREAK_3', titleFa: '3 روز پیوسته', descriptionFa: '3 روز پشت‌سرهم ثبت غذا', icon: '🔥', xp: 40, category: 'STREAK' },
  { code: 'STREAK_7', titleFa: 'هفته کامل', descriptionFa: '7 روز پشت‌سرهم ثبت غذا', icon: '🏆', xp: 100, category: 'STREAK' },
  { code: 'WEIGHT_LOG_5', titleFa: 'ترازوی منظم', descriptionFa: '5 بار وزن ثبت کردی', icon: '⚖️', xp: 50, category: 'PROGRESS' },
]

async function main() {
  for (const a of ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { code: a.code },
      update: { titleFa: a.titleFa, descriptionFa: a.descriptionFa, icon: a.icon, xp: a.xp, category: a.category },
      create: a,
    })
  }
  console.log(`[seed-achievements] ${ACHIEVEMENTS.length} achievements ensured. ✅`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
