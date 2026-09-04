import type { ActivityLevel, BudgetLevel, DietTag, GoalType } from '@/lib/nutrition/engine'

/** Persian display labels — single source of truth for UI copy. */

export const GOAL_LABEL: Record<GoalType, string> = {
  LOSE_WEIGHT: 'کاهش وزن',
  MAINTAIN: 'تثبیت وزن',
  GAIN_WEIGHT: 'افزایش وزن',
  BUILD_MUSCLE: 'عضله‌سازی',
  RECOMP: 'ری‌کامپ',
}

export const GOAL_HINT: Record<GoalType, string> = {
  LOSE_WEIGHT: 'چربی‌سوزی تدریجی و پایدار',
  MAINTAIN: 'حفظ وزن فعلی و عادت‌های سالم',
  GAIN_WEIGHT: 'افزایش وزن سالم و کنترل‌شده',
  BUILD_MUSCLE: 'عضله‌سازی با پروتئین کافی',
  RECOMP: 'کاهش چربی و حفظ عضله همزمان',
}

export const ACTIVITY_LABEL: Record<ActivityLevel, { title: string; hint: string }> = {
  SEDENTARY: { title: 'کم‌تحرک', hint: 'کار نشسته، ورزش ندارم' },
  LIGHT: { title: 'کم', hint: 'هفته‌ای 1 تا 2 روز فعالیت سبک' },
  MODERATE: { title: 'متوسط', hint: 'هفته‌ای 3 تا 4 روز ورزش' },
  ACTIVE: { title: 'پرتحرک', hint: 'هفته‌ای 5 تا 6 روز ورزش' },
  VERY_ACTIVE: { title: 'خیلی پرتحرک', hint: 'ورزش روزانه یا کار بدنی سنگین' },
}

export const BUDGET_LABEL: Record<BudgetLevel, { title: string; hint: string }> = {
  ECONOMY: { title: 'اقتصادی', hint: 'مواد ساده و مقرون‌به‌صرفه' },
  MID: { title: 'متوسط', hint: 'تعادل بین تنوع و هزینه' },
  FLEXIBLE: { title: 'آزاد', hint: 'بدون محدودیت خاص' },
}

export const DIET_TAG_LABEL: Record<DietTag, string> = {
  NORMAL: 'عادی',
  VEGETARIAN: 'گیاهی',
  VEGAN: 'وگان',
  KETO: 'کتوژنیک',
  HIGH_PROTEIN: 'پروتئین بالا',
  HALAL: 'حلال',
  LOW_CARB: 'کم‌کربوهیدرات',
  GLUTEN_FREE: 'بدون گلوتن',
}

export const MEAL_LABEL: Record<string, string> = {
  BREAKFAST: 'صبحانه',
  LUNCH: 'ناهار',
  SNACK: 'میان‌وعده',
  DINNER: 'شام',
}

/** Meal suggestion by time of day (until the meal planner takes over). */
export function suggestedMealByHour(hour: number): string {
  if (hour < 10) return MEAL_LABEL.BREAKFAST
  if (hour < 15) return MEAL_LABEL.LUNCH
  if (hour < 18) return MEAL_LABEL.SNACK
  return MEAL_LABEL.DINNER
}
