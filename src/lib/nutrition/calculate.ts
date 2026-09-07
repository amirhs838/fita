import { AppConfig } from '@/lib/config'
import { CALCULATION_ENGINE_VERSION } from './constants'
import { healthyWeightRangeKg, estimateBodyFat, proteinReferenceWeightKg, waistToHeightRatio, calcBmiValue } from './bodyComposition'
import { planGoalEnergy, recommendedWeeklyGainKg, recommendedWeeklyLossKg, simulateWeightTrajectory, tdeeFromRmr } from './energy'
import { carbohydrateTargetG, fatTargetG, fiberTargetG, proteinTargetG } from './macros'
import { resolveRmr, sanitizeMeasurements } from './rmr'
import { resolveSpecialStates } from './specialStates'
import { calibrateEnergyNeeds, confidenceFor } from './calibration'
import { validateEngineInputs } from './validation'
import { ACTIVITY_FACTORS } from './constants'
import type { CalculationResult, EngineInput, GoalInput, EngineWarning } from './types'

/**
 * calculateNutritionTargets — the deterministic engine (§1/§40/§56).
 * Hierarchy: validation → body composition → RMR (Level 1/2) → TDEE →
 * goal strategy → calibration (Level 3) → special states → safety floors →
 * macros → simulation (timeline + expected pace). Same input ⇒ same output.
 */
export function calculateNutritionTargets(input: EngineInput, goal: GoalInput): CalculationResult {
  const validation = validateEngineInputs(input)
  if (!validation.ok) {
    throw new Error(validation.errorFa ?? 'اطلاعات ورودی معتبر نیست.')
  }
  const warnings: EngineWarning[] = [...validation.warnings]
  const measurements = sanitizeMeasurements(input.measurements)

  // ── Body composition context (§20–§26) ──
  const bmi = calcBmiValue(input.currentWeightKg, input.heightCm)
  const bf = estimateBodyFat(input.gender, input.heightCm, measurements)
  const whtr = waistToHeightRatio(measurements, input.heightCm)
  const bodyFatPct = bf?.pct ?? null
  const bodyFatMethod = bf?.method ?? null
  const healthyRange = healthyWeightRangeKg(input.heightCm)
  const refWeight = proteinReferenceWeightKg(input.heightCm, input.currentWeightKg)

  const bodyComposition: CalculationResult['bodyComposition'] = {
    bmi: Math.round(bmi * 10) / 10,
    healthyWeightRange: healthyRange,
    bodyFatPct: bodyFatPct != null ? Math.round(bodyFatPct * 10) / 10 : null,
    bodyFatMethod,
    fatMassKg: bodyFatPct != null ? Math.round((input.currentWeightKg * (bodyFatPct / 100)) * 10) / 10 : null,
    fatFreeMassKg: bodyFatPct != null ? Math.round((input.currentWeightKg * (1 - bodyFatPct / 100)) * 10) / 10 : null,
    waistToHeightRatio: whtr != null ? Math.round(whtr * 1000) / 1000 : null,
    adjustedBodyWeightKg: Math.round(refWeight * 10) / 10,
    proteinReferenceWeightKg: Math.round(refWeight * 10) / 10,
  }

  // ── RMR (Level 1/2) → TDEE (§8/§9/§11) ──
  const rmrRes = resolveRmr({
    gender: input.gender,
    age: input.age,
    heightCm: input.heightCm,
    weightKg: input.currentWeightKg,
    bodyFatPct,
    bodyFatMethod,
  })
  const activityFactor = ACTIVITY_FACTORS[input.activityLevel]
  const tdeeValue = tdeeFromRmr(rmrRes.rmr, activityFactor)
  const maintenanceCalories = Math.round(tdeeValue)

  // ── Goal energy strategy (§15–§19/§38/§39) ──
  const plan = planGoalEnergy(input, goal, tdeeValue)

  // ── LEVEL 3 trend calibration (§13) ──
  const simBeforeCalibration = simulateWeightTrajectory({
    gender: input.gender,
    age: input.age,
    heightCm: input.heightCm,
    startWeightKg: input.currentWeightKg,
    activityFactor,
    targetCalories: plan.targetCaloriesBeforeSpecialStates,
    goalWeightKg: goal.targetWeightKg ?? null,
  })
  const calibration = calibrateEnergyNeeds({
    calibration: input.calibration ?? null,
    predictedWeeklyChangeKg: plan.weeklyChangeKg,
  })
  if (calibration.reason === 'INSUFFICIENT_DATA' && input.calibration) {
    warnings.push({
      code: 'CALIBRATION_DATA_INSUFFICIENT',
      messageFa: 'برای تنظیم خودکار هدف، حداقل ۱۴ روز ثبت وزن و ۱۰ روز ثبت غذا لازم است.',
    })
  }
  let targetCalories = plan.targetCaloriesBeforeSpecialStates + calibration.adjustmentKcal

  // ── Special states: no deficits in pregnancy/breastfeeding (§32/§33) ──
  const special = resolveSpecialStates(input)
  warnings.push(...special.warnings)
  if (special.forbidDeficit) {
    targetCalories = Math.max(targetCalories, tdeeValue + special.energyDeltaKcal)
  } else {
    targetCalories += special.energyDeltaKcal
  }

  // ── Hard calorie floor (§35) ──
  const floor = input.gender === 'MALE' ? AppConfig.safety.minKcalMale : AppConfig.safety.minKcalFemale
  let floorHit = false
  if (targetCalories < floor) {
    targetCalories = floor
    floorHit = true
  }
  const targetCaloriesFinal = Math.round(targetCalories)

  // ── Macros (§25–§31) ──
  const dietTags = input.dietTags?.length ? input.dietTags : (['NORMAL'] as const as NonNullable<EngineInput['dietTags']>)
  const proteinG = proteinTargetG({
    goalType: goal.goalType,
    referenceWeightKg: refWeight,
    targetCalories: targetCaloriesFinal,
    dietTags,
  })
  const fatG = fatTargetG({ targetCalories: targetCaloriesFinal, referenceWeightKg: refWeight, dietTags })
  const { carbG, floorApplied: carbFloorApplied } = carbohydrateTargetG({
    targetCalories: targetCaloriesFinal,
    proteinG,
    fatG,
    dietTags,
  })
  const fiberG = fiberTargetG(targetCaloriesFinal)

  if (floorHit) {
    warnings.push({
      code: 'CALORIE_TARGET_TOO_LOW',
      messageFa: 'برای حفظ سلامتی، کالری روزانه از کف ایمنی پایین‌تر نرفت.',
    })
  }
  if (plan.paceClamped) {
    warnings.push({
      code: 'GOAL_RATE_TOO_FAST',
      messageFa: 'سرعت انتخاب‌شده برای تغییر وزن زیاد بود؛ به محدوده ایمن تنظیم شد.',
    })
  }
  if (calibration.adjustmentKcal !== 0) {
    warnings.push({
      code: 'ESTIMATE_NOT_MEASUREMENT',
      messageFa: 'هدف کالری بر اساس روند واقعی وزن تو کمی تنظیم شد.',
    })
  }
  if (carbFloorApplied) {
    warnings.push({
      code: 'CARB_FLOOR_APPLIED',
      messageFa: 'کربوهیدرات در محدوده فیزیولوژیک معقول نگه داشته شد.',
    })
  }

  // ── Timeline + expected pace from the final target (§14/§37) ──
  const sim = simulateWeightTrajectory({
    gender: input.gender,
    age: input.age,
    heightCm: input.heightCm,
    startWeightKg: input.currentWeightKg,
    activityFactor,
    targetCalories: targetCaloriesFinal,
    goalWeightKg: goal.targetWeightKg ?? null,
  })
  if (sim.exceedsHorizon) {
    warnings.push({
      code: 'GOAL_TIMELINE_LONG',
      messageFa: 'برای رسیدن ایمن‌تر به این هدف، زمان بیشتری لازم است.',
    })
  }
  let estimatedGoalDate: string | null = null
  if (sim.weeksToGoal != null) {
    const d = new Date()
    d.setDate(d.getDate() + sim.weeksToGoal * 7)
    estimatedGoalDate = d.toISOString().slice(0, 10)
  }

  const confidence = confidenceFor({
    calibrationApplied: calibration.reason === 'ADJUSTED',
    bodyFatUsed: rmrRes.method === 'Body Composition + FFM',
  })

  const recommendedWeeklyChangeKg =
    goal.goalType === 'LOSE_WEIGHT'
      ? -recommendedWeeklyLossKg(input.currentWeightKg, input.heightCm)
      : goal.goalType === 'GAIN_WEIGHT'
        ? recommendedWeeklyGainKg(input.currentWeightKg)
        : null

  return {
    engineVersion: CALCULATION_ENGINE_VERSION,
    calculationMethod: rmrRes.method,
    dataCompleteness: {
      hasBodyFatEstimate: rmrRes.method === 'Body Composition + FFM',
      hasWaist: measurements?.waistCm != null,
      hasWeightTrend: input.calibration != null,
      calibrationApplied: calibration.reason === 'ADJUSTED',
    },
    confidence,

    rmr: Math.round(rmrRes.rmr),
    estimatedTdee: Math.round(tdeeValue),
    maintenanceCalories,
    targetCalories: targetCaloriesFinal,
    calorieAdjustment: Math.round(targetCaloriesFinal - maintenanceCalories),
    calibrationAdjustmentKcal: calibration.adjustmentKcal,

    proteinGrams: proteinG,
    carbohydrateGrams: carbG,
    fatGrams: fatG,
    fiberGrams: fiberG,

    bmi: Math.round(bmi * 10) / 10,
    healthyWeightRange: healthyRange,
    currentWeightKg: input.currentWeightKg,
    targetWeightKg: goal.targetWeightKg ?? null,

    recommendedWeeklyChangeKg,
    expectedWeeklyWeightChange: Math.round(sim.initialWeeklyChangeKg * 100) / 100,
    estimatedGoalDate,
    weeksToGoal: sim.weeksToGoal,

    gestationalWeightGainRangeKg: special.gestationalWeightGainRangeKg,

    bodyComposition,
    warnings,
    limitations: [
      'معادلات پیش‌بینی برای هر فرد خطای طبیعی دارند؛ نتیجه بهترین برآورد ممکن برای اطلاعات ورودی است.',
      ...(input.pregnancy ? ['سه‌ماهه بارداری در سیستم ثبت نمی‌شود؛ افزودن انرژی بر اساس پیش‌فرض سه‌ماهه دوم است.'] : []),
      ...(input.breastfeeding ? ['سن کودک و نوع شیردهی در سیستم ثبت نمی‌شود؛ افزودن انرژی بر اساس پیش‌فرض ۰ تا ۶ ماهگی است.'] : []),
    ],
  }
}
