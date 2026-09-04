/** Shared client/server types for session-facing payloads. */

export type SubscriptionTier = 'FREE_TRIAL' | 'PRO' | 'EXPIRED'

export interface MeData {
  user: {
    id: string
    phone: string // canonical 989XXXXXXXXX
    name: string | null
  }
  profile: {
    gender: string | null
    heightCm: number | null
    currentWeightKg: number | null
    activityLevel: string | null
    mealsPerDay: number
    budgetLevel: string | null
  } | null
  onboarded: boolean
  goal: {
    type: string
    targetWeightKg: number | null
  } | null
  subscription: {
    tier: SubscriptionTier
    trialEndsAt: string | null
    scansUsed: number
    scansLimit: number
  }
  stats: {
    currentStreak: number
    xp: number
    level: number
  }
}

export interface DailyTargets {
  kcal: number
  proteinG: number
  carbG: number
  fatG: number
  fiberG: number
}

export interface ComputedTargetsData extends DailyTargets {
  method: string
  bmr: number
  tdee: number
  bmi: number
  warnings: string[]
}

export interface SummaryData {
  date: string
  targets: ComputedTargetsData | null
  consumed: DailyTargets
  waterMl: number
  loggedMeals: number
}

export interface OnboardingResult {
  targets: ComputedTargetsData
}

export interface VerifyOtpData {
  user: { id: string; phone: string; name: string | null }
  onboarded: boolean
  /** JWT session token — stored client-side as Bearer fallback when cookies are blocked (iframe preview). */
  token: string
}

export interface RequestOtpData {
  expiresIn: number
  devCode?: string
}

// ─────────────────────── Food & diary (Phase 4) ───────────────────────

export type MealType = 'BREAKFAST' | 'LUNCH' | 'SNACK' | 'DINNER'

export interface FoodServingDto {
  id: string
  labelFa: string
  unitType: string
  grams: number
  isDefault: boolean
}

export interface FoodDto {
  id: string
  nameFa: string
  nameEn: string | null
  category: string
  isIranian: boolean
  source: string
  confidence: number
  kcalPer100g: number
  proteinPer100g: number
  carbsPer100g: number
  fatPer100g: number
  imageUrl?: string | null
  servings: FoodServingDto[]
}

export interface FoodSearchData {
  foods: FoodDto[]
}

export interface FoodGuessData {
  food: FoodDto
  matchedToDb: boolean
}

// ───────────────────── Admin food bank (dedicated address) ─────────────────────

export type AdminBudgetLevel = 'ECONOMY' | 'MID' | 'FLEXIBLE'
export type AdminMealSlot = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK'

export interface AdminSessionData {
  authed: boolean
}

export interface AdminFoodDto extends FoodDto {
  foodType: string
  fiberPer100g: number | null
  imageUrl: string | null
  createdAt: string
  /** plan-optimizer tag — null = not a plan option */
  budgetLevel: AdminBudgetLevel | null
  /** plan-optimizer meal slots (empty = not plan-eligible) */
  mealSlots: AdminMealSlot[]
}

export interface AdminFoodListData {
  foods: AdminFoodDto[]
  total: number
}

export interface AdminCreateFoodData {
  food: AdminFoodDto
}

export interface AdminDeleteFoodData {
  deletedId: string
  nameFa: string
}

// ───────────────────── Admin AI settings (OpenRouter) ─────────────────────

export type AdminAiProviderName = 'openrouter' | 'zai' | 'mock'

export interface AdminAiSettingsData {
  provider: AdminAiProviderName
  hasKey: boolean
  keySource: 'db' | 'env' | 'none'
  apiKeyMasked: string
  textModel: string
  visionModel: string
  /** Values actually stored in DB (the panel's editable state). */
  dbTextModel: string
  dbVisionModel: string
}

export interface AdminAiPutPayload {
  /** omitted → unchanged; '' → delete stored key; otherwise upsert */
  apiKey?: string
  textModel?: string
  visionModel?: string
}

export interface AdminAiTestData {
  ok: true
  model: string
  latencyMs: number
  reply: string
}

export interface DiaryItem {
  id: string
  foodId: string | null
  nameFa: string
  grams: number
  servingLabel: string | null
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  fiberG: number | null
  confidence: number | null
}

export interface DiaryLog {
  id: string
  mealType: string
  source: string
  note: string | null
  createdAt: string
  items: DiaryItem[]
}

export interface DiaryData {
  date: string
  logs: DiaryLog[]
}

export interface AddLogData {
  logId: string
  date: string
  mealType: string
  itemCount: number
  kcal: number
  awards?: AchievementDto[]
}

export interface WaterData {
  date: string
  waterMl: number
}

// ─────────────────────── Scan (Phase 5) ───────────────────────

export interface ScanFoodItem {
  foodId: string
  nameFa: string
  matchedToDb: boolean
  estimatedGrams: number
  kcalPer100g: number
  confidence: number
}

export interface ScanData {
  foods: ScanFoodItem[]
  overallConfidence: number
  /** null = unlimited (PRO) */
  scansRemaining: number | null
}

// ─────────────────────── Meal plan (Phase 6) ───────────────────────

export interface PlanItemDto {
  id: string
  mealType: string
  titleFa: string
  grams: number | null
  servingLabel: string | null
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  order: number
  status: string
}

export interface MealPlanData {
  id: string
  startDate: string
  endDate: string
  targets: DailyTargets
  /** budget tier the plan was generated for (null on legacy plans) */
  budgetLevel: AdminBudgetLevel | null
  days: {
    date: string
    dayIndex: number
    /** per-day tier when the day was regenerated individually (null = plan default) */
    budgetLevel: AdminBudgetLevel | null
    items: PlanItemDto[]
  }[]
}

export interface MealPlanResponse {
  plan: MealPlanData | null
  awards?: AchievementDto[]
}

export interface SwapItemData {
  item: PlanItemDto
  dayId: string
}

export interface RegenerateDayData {
  plan: MealPlanData
}

// ─────────────────────── AI Coach (Phase 7) ───────────────────────

export interface CoachMessageDto {
  id: string
  role: 'user' | 'assistant'
  content: string
  suggestion: string | null
  createdAt: string
}

export interface CoachConversationData {
  conversationId: string
  messages: CoachMessageDto[]
}

export interface CoachReplyData {
  conversationId: string
  reply: CoachMessageDto
}

// ─────────────────────── Gamification (Phase 9) ───────────────────────

export interface AchievementDto {
  code: string
  titleFa: string
  descriptionFa: string
  icon: string | null
  xp: number
}

// ─────────────────────── Weight & Progress (Phase 8) ───────────────────────

export interface WeightRecordDto {
  date: string
  weightKg: number
  source?: string
}

export interface WeightData {
  records: WeightRecordDto[]
}

export interface AddWeightData {
  record: { date: string; weightKg: number }
  awards: AchievementDto[]
}

export interface ProgressData {
  weight: {
    startKg: number | null
    currentKg: number | null
    targetKg: number | null
    changeKg: number | null
    records: { date: string; weightKg: number }[]
  }
  targets: ComputedTargetsData | null
  stats: {
    currentStreak: number
    longestStreak: number
    xp: number
    level: number
    xpToNextLevel: number
  }
  consistency: { days: { date: string; logged: boolean }[] }
}

export interface AchievementsData {
  achievements: (AchievementDto & { category: string; unlocked: boolean; unlockedAt: string | null })[]
}

export interface LeaderboardEntry {
  rank: number
  userId: string
  name: string
  score: number
  isMe: boolean
}

export interface LeaderboardData {
  period: string
  entries: LeaderboardEntry[]
  myRank: number | null
  myScore: number
}

// ─────────────────────── Subscription (Phase 10) ───────────────────────

export interface PlanDefDto {
  id: string
  titleFa: string
  subtitleFa: string
  priceToman: number
  durationDays: number
  perMonthToman: number
  discountPct: number | null
  badgeFa: string | null
  featuresFa: string[]
}

export interface SubscriptionData {
  tier: SubscriptionTier
  trialEndsAt: string | null
  trialDaysLeft: number | null
  scansUsed: number
  scansLimit: number
  scansRemaining: number | null
  proExpiresAt: string | null
  provider: string | null
  paymentProvider: string
  plans: PlanDefDto[]
}

export interface CheckoutData {
  referenceId: string
  status: 'PENDING' | 'PAID'
  redirectUrl: string | null
  subscription: SubscriptionData
}

export interface VerifyPaymentData {
  subscription: SubscriptionData
  activated: boolean
}

// ─────────────────────── Notifications & reminders (Phase 11) ───────────────────────

export interface NotificationPrefsData {
  pushEnabled: boolean
  mealReminder: boolean
  mealTimes: string[]
  waterReminder: boolean
  weeklyWeightReminder: boolean
  streakReminder: boolean
  weeklySummary: boolean
}

export type ReminderType = 'MEAL' | 'WATER' | 'WEIGHT' | 'STREAK' | 'PLAN'
export type ReminderAction = 'LOG_FOOD' | 'LOG_WATER' | 'LOG_WEIGHT' | 'OPEN_PLAN'

export interface ReminderDto {
  id: string
  type: ReminderType
  titleFa: string
  bodyFa: string
  action: ReminderAction
}

export interface RemindersData {
  reminders: ReminderDto[]
}
