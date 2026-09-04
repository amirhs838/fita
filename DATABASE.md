# Fita — Database

Prisma + SQLite in this sandbox. The schema avoids SQLite-only features so switching `provider = "postgresql"` is a one-line change. SQLite has no native enums → **String columns with documented constant sets**, validated by zod at the API boundary. No primitive arrays → JSON stored in `*Json String` columns.

## Entity map

| Model | Purpose | Key fields |
|---|---|---|
| `User` | Account root | `phone` (unique, canonical `989XXXXXXXXX`), `name`, `status` (ACTIVE/DELETED) |
| `OtpCode` | Login codes | `phone`, `codeHash` (sha256, salted with JWT_SECRET), `expiresAt`, `attempts`, `consumedAt` |
| `UserProfile` | 1:1 profile | gender, birthYear, heightCm, currentWeightKg, activityLevel, mealsPerDay, budgetLevel (ECONOMY/MID/FLEXIBLE), pregnancy, breastfeeding, medications, medicalNotes, `onboardedAt` |
| `Goal` | Active + archived goals | type (LOSE_WEIGHT/MAINTAIN/GAIN_WEIGHT/BUILD_MUSCLE/RECOMP/CUSTOM), targetWeightKg, paceKgPerWeek, status, snapshot of computed targets (kcal/protein/carb/fat/fiber), `method` (formula version) |
| `BodyMeasurement` | Time-series body metrics | date, waist/hip/neck/arm/thigh/wrist cm, `otherJson` |
| `WeightRecord` | Daily/weekly weight | date (unique per user/day), weightKg, source |
| `DietPreference` | Tags | tag (VEGETARIAN/VEGAN/KETO/HIGH_PROTEIN/HALAL/LOW_CARB/GLUTEN_FREE/OTHER), unique per user |
| `Allergy` | Hard exclusions | name (normalized), severity (MILD/SEVERE), unique per user — **MUST NEVER appear in plans** |
| `DislikedFood` | Soft exclusions | name, unique per user — SHOULD NOT appear |
| `FavoriteFood` | Loves | foodId, unique per user — weighted into meal plans |
| `Food` | Structured nutrition truth | nameFa/nameEn, category, foodType (DISH/INGREDIENT/BRAND), isIranian, source (SEED/AI_ESTIMATE/USER), confidence, **per-100g nutrition** (kcal/protein/carbs/fat/fiber/sugar/sodiumMg), searchText |
| `FoodServing` | Iranian-style units | labelFa (یک بشقاب، یک کفگیر، یک سیخ…), unitType (PLATE/LADLE/SPOON/GLASS/SKEWER/PIECE/CUP/SLICE/GRAM/CUSTOM), grams, isDefault |
| `FoodLog` | One meal entry | userId, date (ISO day), mealType (BREAKFAST/LUNCH/SNACK/DINNER), source (SCAN/SEARCH/MANUAL/PLAN), note |
| `FoodLogItem` | Food inside a log | foodId?, nameFa snapshot, grams, servingLabel, computed kcal/macros, confidence, `aiMetaJson` (scan provenance) |
| `MealPlan` | 7-day plan | userId, startDate, endDate, status, `targetsJson` snapshot |
| `MealPlanDay` | Plan day | planId, date, dayIndex |
| `MealPlanItem` | Planned meal | dayId, mealType, foodId?, titleFa, grams, servingLabel, kcal/macros, status (PLANNED/EATEN/SWAPPED/SKIPPED) |
| `WaterLog` | Water entries | userId, date, amountMl |
| `AIConversation` / `AIMessage` | Coach threads | role (USER/ASSISTANT/SYSTEM), content, `metaJson` |
| `Subscription` | 1:1 entitlements | tier (FREE_TRIAL/PRO/EXPIRED), trialStartedAt/trialEndsAt, scansUsed/scansLimit, proStartedAt/proExpiresAt, provider |
| `PaymentOrder` | Payment audit trail (Phase 10) | userId, planId, provider (mock/zarinpal/…), amountToman, referenceId unique, status (PENDING/PAID/FAILED/CANCELED), paidAt, `metaJson` (non-secret references only) |
| `Achievement` / `UserAchievement` | Gamification | code unique, titleFa, xp; unlock join table |
| `UserStats` | Streak & XP (1:1) | currentStreak, longestStreak, xp, level, lastLogDate |
| `LeaderboardRecord` | Precomputed ranks | userId+period unique (WEEKLY/MONTHLY/ALL_TIME), score (based on consistency/streak/goal completion — never body weight) |
| `Challenge` / `ChallengeParticipant` | Challenges | code, titleFa, kind, window; join table |
| `NotificationPreference` | 1:1 toggles | pushEnabled, mealReminder, mealTimesJson, waterReminder, weeklyWeightReminder, streakReminder, weeklySummary |
| `ProgressRecord` | Daily rollup for fast analytics | userId+date unique, kcalConsumed/Target, proteinConsumed/Target, waterMl, loggedMeals, adherenceScore |
| `AnalyticsEvent` | Product analytics | userId?, name (e.g. `food_scanned`), `propsJson` — **no PII** |

## Indexes & constraints (highlights)

- `User.phone` unique · `OtpCode (phone, createdAt)` · `FoodLog (userId, date)` · `FoodLogItem.logId`
- `WeightRecord (userId, date)` unique · `ProgressRecord (userId, date)` unique · `LeaderboardRecord (userId, period)` unique
- `FoodServing (foodId)` · `MealPlan (userId, status)` · `AIMessage (conversationId, createdAt)` · `Food.searchText`, `Food.category`

## Design decisions

1. **Nutrition stored per-100g + separate `FoodServing` grams table** → any unit (بشقاب/سیخ/قاشق) converts deterministically; AI never stores raw nutrition for known foods.
2. **`FoodLogItem` snapshots name + computed nutrition** → diary is immune to later food-database edits.
3. **Dates are ISO `YYYY-MM-DD` strings** → day grouping is trivial and timezone-explicit (app TZ: user local, server stores day key from client-supplied local date).
4. **`AI_ESTIMATE` foods** get `confidence < 1` and `source = AI_ESTIMATE`; they can later be promoted by admin review.
5. **Onboarding free-text likes** are stored as a JSON array in `UserProfile.likedFoodsJson` (planner input). `FavoriteFood` rows remain the foodId-linked favorites created from the food DB (heart button, Phase 4+).
6. **Testing note** — deterministic logic to cover when a test runner is allowed: portion conversion (g ↔ servings), calorie aggregation per day, goal/target computation & safety clamps, allergy/dislike filtering in plan generation, scan-limit & trial expiry, streak calculation, leaderboard scoring. These are written as pure functions precisely to make that suite mechanical.

## Seeding plan (Phase 4 / 71)

~120 Iranian foods (قورمه‌سبزی، قیمه، چلوکباب، عدس‌پلو، ته‌چین، آبگوشت، آش رشته، املت، کتلت، کوکو…), dairy/bread/rice staples, common fast food — each with per-100g values from standard Iranian food-composition references and 1–4 Persian servings. Test users with varied goals/preferences/budgets + sample 7-day plan.
