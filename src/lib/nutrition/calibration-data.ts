import { db } from '@/lib/db'
import { weeklyTrendKg, type EnergyCalibrationInput, type EngineMeasurements } from './index'
import type { ComputeOptions } from './engine'

/**
 * Assembles the engine's optional enrichment inputs from the DB (§44/§55):
 * the ENGINE stays pure — the caller is the one allowed to touch storage.
 *
 *  - measurements → latest BodyMeasurement row (LEVEL 2 body-fat path)
 *  - calibration  → ≥14 days of weight history + ≥10 logged intake days (LEVEL 3)
 *
 * Returns undefined-shaped options (all null) when the data is not there;
 * the engine then runs the standard LEVEL 1 path with zero behavior change.
 */
export async function buildComputeOptions(userId: string): Promise<ComputeOptions> {
  const since14 = new Date()
  since14.setDate(since14.getDate() - 13)
  const sinceKey = since14.toISOString().slice(0, 10)

  const [measurement, weights, recentLogs] = await Promise.all([
    db.bodyMeasurement.findFirst({ where: { userId }, orderBy: { date: 'desc' } }),
    db.weightRecord.findMany({
      where: { userId },
      orderBy: { date: 'asc' },
      take: 90,
      select: { date: true, weightKg: true },
    }),
    db.foodLog.findMany({
      where: { userId, date: { gte: sinceKey } },
      select: { date: true, items: { select: { kcal: true } } },
    }),
  ])

  const measurements: EngineMeasurements | null = measurement
    ? {
        waistCm: measurement.waistCm,
        hipCm: measurement.hipCm,
        neckCm: measurement.neckCm,
      }
    : null

  // Distinct logged days + average intake on logged days (adherence gate §13).
  const perDay = new Map<string, number>()
  for (const log of recentLogs) {
    const kcal = log.items.reduce((s, it) => s + it.kcal, 0)
    perDay.set(log.date, (perDay.get(log.date) ?? 0) + kcal)
  }
  const loggedDays = perDay.size
  const avgIntake =
    loggedDays > 0 ? [...perDay.values()].reduce((s, k) => s + k, 0) / loggedDays : 0

  const trend = weeklyTrendKg(weights.map((w) => ({ date: w.date, weightKg: w.weightKg })))

  let calibration: EnergyCalibrationInput | null = null
  if (trend != null && loggedDays >= 10) {
    calibration = {
      observedWeeklyChangeKg: Math.round(trend * 1000) / 1000,
      observedIntakeKcal: Math.round(avgIntake),
      loggedDays,
    }
  }

  return { measurements, calibration }
}
