import { z } from 'zod'
import type { ActivityLevel, BudgetLevel, DietTag, Gender, GoalType } from '@/lib/nutrition/engine'

/** Shared onboarding contract — same zod schema validates client payload and server input. */

export const onboardingSchema = z.object({
  name: z.string().trim().min(2, 'نام را کامل وارد کن.').max(60),
  gender: z.enum(['MALE', 'FEMALE']),
  age: z.number().int().min(13, 'فیتا برای زیر 13 سال مناسب نیست.').max(90),
  heightCm: z.number().min(100).max(230),
  currentWeightKg: z.number().min(35).max(250),
  goalType: z.enum(['LOSE_WEIGHT', 'MAINTAIN', 'GAIN_WEIGHT', 'BUILD_MUSCLE', 'RECOMP']),
  targetWeightKg: z.number().min(30).max(300).nullable(),
  activityLevel: z.enum(['SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE']),
  mealsPerDay: z.number().int().min(2).max(6),
  dietPreferences: z.array(
    z.enum(['NORMAL', 'VEGETARIAN', 'VEGAN', 'KETO', 'HIGH_PROTEIN', 'HALAL', 'LOW_CARB', 'GLUTEN_FREE']),
  ),
  allergies: z.array(z.string().trim().min(2).max(40)).max(12),
  dislikedFoods: z.array(z.string().trim().min(2).max(40)).max(20),
  likedFoods: z.array(z.string().trim().min(2).max(40)).max(20),
  budgetLevel: z.enum(['ECONOMY', 'MID', 'FLEXIBLE']),
  pregnancy: z.boolean(),
  breastfeeding: z.boolean(),
  medications: z.string().trim().max(300).nullable(),
  medicalNotes: z.string().trim().max(300).nullable(),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  measurements: z
    .object({
      waistCm: z.number().min(20).max(200).nullable(),
      hipCm: z.number().min(20).max(200).nullable(),
      neckCm: z.number().min(15).max(100).nullable(),
      armCm: z.number().min(10).max(100).nullable(),
      thighCm: z.number().min(20).max(150).nullable(),
      wristCm: z.number().min(8).max(50).nullable(),
    })
    .nullable(),
})

export type OnboardingInput = z.infer<typeof onboardingSchema>

/** Wizard draft state — inputs stay strings until submit. */
export interface OnboardingDraft {
  name: string
  gender: Gender | null
  age: string
  heightCm: string
  currentWeightKg: string
  goalType: GoalType | null
  targetWeightKg: string
  activityLevel: ActivityLevel | null
  mealsPerDay: number
  dietPreferences: DietTag[]
  allergies: string[]
  dislikedFoods: string[]
  likedFoods: string[]
  budgetLevel: BudgetLevel | null
  pregnancy: boolean
  breastfeeding: boolean
  medications: string
  medicalNotes: string
  measurements: {
    waistCm: string
    hipCm: string
    neckCm: string
    armCm: string
    thighCm: string
    wristCm: string
  }
}

export const emptyDraft: OnboardingDraft = {
  name: '',
  gender: null,
  age: '',
  heightCm: '',
  currentWeightKg: '',
  goalType: null,
  targetWeightKg: '',
  activityLevel: null,
  mealsPerDay: 3,
  dietPreferences: [],
  allergies: [],
  dislikedFoods: [],
  likedFoods: [],
  budgetLevel: null,
  pregnancy: false,
  breastfeeding: false,
  medications: '',
  medicalNotes: '',
  measurements: { waistCm: '', hipCm: '', neckCm: '', armCm: '', thighCm: '', wristCm: '' },
}

function numOrThrow(s: string, label: string): number {
  const n = Number(s.replace(/[^\d.]/g, ''))
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${label} را درست وارد کن.`)
  return n
}

/** Assemble + validate the final payload from draft state; throws Error with Persian message. */
export function draftToInput(draft: OnboardingDraft, today: string): OnboardingInput {
  if (!draft.gender) throw new Error('جنسیت را انتخاب کن.')
  if (!draft.goalType) throw new Error('هدف را انتخاب کن.')
  if (!draft.activityLevel) throw new Error('سطح فعالیت را انتخاب کن.')
  if (!draft.budgetLevel) throw new Error('سطح بودجه را انتخاب کن.')

  const needsTarget = draft.goalType === 'LOSE_WEIGHT' || draft.goalType === 'GAIN_WEIGHT'
  const targetRaw = draft.targetWeightKg.trim()
  let targetWeightKg: number | null = null
  if (targetRaw) {
    targetWeightKg = numOrThrow(targetRaw, 'وزن هدف')
  } else if (needsTarget) {
    throw new Error('وزن هدف را وارد کن.')
  }

  const measure = (s: string): number | null => {
    const t = s.trim()
    if (!t) return null
    const n = Number(t.replace(/[^\d.]/g, ''))
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const m = draft.measurements
  const hasMeasurements = Boolean(
    m.waistCm || m.hipCm || m.neckCm || m.armCm || m.thighCm || m.wristCm,
  )

  return onboardingSchema.parse({
    name: draft.name,
    gender: draft.gender,
    age: numOrThrow(draft.age, 'سن'),
    heightCm: numOrThrow(draft.heightCm, 'قد'),
    currentWeightKg: numOrThrow(draft.currentWeightKg, 'وزن فعلی'),
    goalType: draft.goalType,
    targetWeightKg,
    activityLevel: draft.activityLevel,
    mealsPerDay: draft.mealsPerDay,
    dietPreferences: draft.dietPreferences,
    allergies: draft.allergies,
    dislikedFoods: draft.dislikedFoods,
    likedFoods: draft.likedFoods,
    budgetLevel: draft.budgetLevel,
    // Data hygiene: pregnancy/breastfeeding only meaningful for FEMALE profiles.
    pregnancy: draft.gender === 'FEMALE' ? draft.pregnancy : false,
    breastfeeding: draft.gender === 'FEMALE' ? draft.breastfeeding : false,
    medications: draft.medications.trim() || null,
    medicalNotes: draft.medicalNotes.trim() || null,
    today,
    measurements: hasMeasurements
      ? {
          waistCm: measure(m.waistCm),
          hipCm: measure(m.hipCm),
          neckCm: measure(m.neckCm),
          armCm: measure(m.armCm),
          thighCm: measure(m.thighCm),
          wristCm: measure(m.wristCm),
        }
      : null,
  })
}
