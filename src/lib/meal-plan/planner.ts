import { db } from '@/lib/db'
import { normalizeFaSearch } from '@/lib/food-search'

/**
 * Meal Planner (Phase 6) — deterministic, constraint-first, AI-free.
 *
 * Trust rules: the planner only ever *selects* real DB foods; every kcal/macro
 * number is computed from per-100g rows here, never estimated. Allergies and
 * disliked foods are HARD exclusions that are never relaxed. Diet-style and
 * budget filters relax progressively when a pool would become empty.
 * Variety comes from a deterministic rotation (seeded per generation) so two
 * regenerations differ, while consecutive days never repeat a main dish.
 */

export interface PlannerTargets {
  kcal: number
  proteinG: number
  carbG: number
  fatG: number
  fiberG: number
}

export interface PlannerContext {
  mealsPerDay: number
  dietPreferences: string[]
  allergies: string[]
  dislikedFoods: string[]
  likedFoods: string[]
  budgetLevel: string | null
  pregnancy: boolean
  breastfeeding: boolean
  targets: PlannerTargets
}

interface PoolFood {
  id: string
  nameFa: string
  searchText: string
  category: string
  kcalPer100g: number
  proteinPer100g: number
  carbsPer100g: number
  fatPer100g: number
  servings: { labelFa: string; grams: number }[]
}

type Role = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK'

// ─────────────────────── Food roles (curated Iranian semantics) ───────────────────────

const BREAKFAST_MAIN_NAMES = [
  'املت گوجه',
  'نیمرو',
  'عدسی',
  'حلیم گندم و گوشت',
  'دل و جگر',
  'میرزا قاسمی',
  'سوپ جو',
  'آش رشته',
  'تخم‌مرغ آب‌پز',
]
const BREAKFAST_SIDE_CATEGORIES = ['BREAD']
const BREAKFAST_SIDE_NAMES = [
  'پنیر سفید ایرانی',
  'پنیر خامه‌ای',
  'کره حیوانی',
  'شیر پرچرب',
  'شیر کم‌چرب',
  'عسل',
  'خرما',
  'کشمش پلویی',
  'گردو',
  'خامه پرچرب',
  'گوجه',
  'خیار',
]
const STEW_PREFIX = 'خورشت'
const LIGHT_DINNER_NAMES = [
  'سوپ جو',
  'عدسی',
  'آش رشته',
  'کشک بادمجان',
  'میرزا قاسمی',
  'املت گوجه',
  'نیمرو',
  'سالاد شیرازی',
]
const SNACK_CATEGORIES = ['FRUIT']
const SNACK_NAMES = [
  'ماست کم‌چرب',
  'ماست یونانی',
  'ماست پرچرب',
  'دوغ',
  'آجیل مخلوط',
  'پسته بوداده',
  'بادام درختی',
  'گردو',
  'بیسکویت ساده',
  'پاپ‌کورن ساده',
  'تخمه آفتابگردان',
  'تخمه کدو',
  'خرما',
  'کشمش پلویی',
]

/**
 * Allergen presets expand into structural exclusions beyond raw name tokens:
 * e.g. «تخم مرغ» must also kill املت/نیمرو/میرزا قاسمی (no literal 'تخم' in name).
 */
interface StructuralRule {
  categories?: string[]
  nameHas?: string[]
}

const DAIRY_RULE: StructuralRule = {
  categories: ['DAIRY'],
  nameHas: ['کره', 'خامه', 'ماست', 'پنیر', 'دوغ', 'کشک', 'شیر', 'فرنی'],
}
const EGG_RULE: StructuralRule = { nameHas: ['تخم', 'املت', 'نیمرو', 'میرزا قاسمی', 'کوکو'] }
const GLUTEN_RULE: StructuralRule = {
  categories: ['BREAD'],
  nameHas: ['نان', 'حلیم', 'آش رشته', 'بیسکویت', 'سوپ جو', 'شیرینی', 'کیک', 'ماکارونی', 'ساندویچ', 'برگر', 'هویج سوخاری'],
}
const NUT_RULE: StructuralRule = { nameHas: ['آجیل', 'پسته', 'بادام درختی', 'گردو', 'تخمه', 'بادام زمینی', 'ارده', 'حلوا ارده', 'فسنجان'] }
const PEANUT_RULE: StructuralRule = { nameHas: ['آجیل مخلوط', 'بادام زمینی'] }
const SOY_RULE: StructuralRule = { nameHas: ['سویا'] }
const FISH_RULE: StructuralRule = { nameHas: ['ماهی', 'قزل', 'تن ماهی'] }
const SHRIMP_RULE: StructuralRule = { nameHas: ['میگو'] }
const CHOCO_RULE: StructuralRule = { nameHas: ['شکلات'] }

function structuralRulesFor(allergy: string): StructuralRule[] {
  const a = normalizeFaSearch(allergy)
  const rules: StructuralRule[] = []
  if (a.includes('لبنیات') || a.includes('لاکتوز')) rules.push(DAIRY_RULE)
  if (a.includes('تخم')) rules.push(EGG_RULE)
  if (a.includes('گلوتن') || a.includes('گندم')) rules.push(GLUTEN_RULE)
  if (a.includes('آجیل') || a.includes('خشکبار')) rules.push(NUT_RULE)
  if (a.includes('بادام زمینی')) rules.push(PEANUT_RULE)
  if (a.includes('سویا')) rules.push(SOY_RULE)
  if (a.includes('ماهی')) rules.push(FISH_RULE)
  if (a.includes('میگو')) rules.push(SHRIMP_RULE)
  if (a.includes('شکلات')) rules.push(CHOCO_RULE)
  return rules
}

const ECONOMY_EXCLUDE = ['قزل', 'میگو', 'ماهی سفید', 'شیشلیک', 'آجیل مخلوط', 'پسته', 'بادام درختی', 'خامه', 'فسنجان']
const MEAT_WORDS = ['گوشت', 'مرغ', 'ماهی', 'میگو', 'کباب', 'دل و جگر', 'تن ماهی', 'حلیم', 'آبگوشت', 'خورشت', 'شیشلیک', 'برگر', 'سوسیس']
const DAIRY_EGG_WORDS = ['پنیر', 'ماست', 'شیر', 'کره', 'خامه', 'دوغ', 'کشک', 'تخم']

// ─────────────────────── Slot split ───────────────────────

export interface SlotSpec {
  mealType: 'BREAKFAST' | 'LUNCH' | 'SNACK' | 'DINNER'
  share: number
  order: number
}

export function slotsForMealsPerDay(n: number): SlotSpec[] {
  switch (n) {
    case 2:
      return [
        { mealType: 'BREAKFAST', share: 0.4, order: 0 },
        { mealType: 'DINNER', share: 0.6, order: 1 },
      ]
    case 4:
      return [
        { mealType: 'BREAKFAST', share: 0.25, order: 0 },
        { mealType: 'LUNCH', share: 0.35, order: 1 },
        { mealType: 'SNACK', share: 0.1, order: 2 },
        { mealType: 'DINNER', share: 0.3, order: 3 },
      ]
    case 5:
      return [
        { mealType: 'BREAKFAST', share: 0.25, order: 0 },
        { mealType: 'SNACK', share: 0.1, order: 1 },
        { mealType: 'LUNCH', share: 0.3, order: 2 },
        { mealType: 'SNACK', share: 0.1, order: 3 },
        { mealType: 'DINNER', share: 0.25, order: 4 },
      ]
    case 6:
      return [
        { mealType: 'BREAKFAST', share: 0.22, order: 0 },
        { mealType: 'SNACK', share: 0.1, order: 1 },
        { mealType: 'LUNCH', share: 0.28, order: 2 },
        { mealType: 'SNACK', share: 0.1, order: 3 },
        { mealType: 'DINNER', share: 0.2, order: 4 },
        { mealType: 'SNACK', share: 0.1, order: 5 },
      ]
    default: // 3
      return [
        { mealType: 'BREAKFAST', share: 0.3, order: 0 },
        { mealType: 'LUNCH', share: 0.4, order: 1 },
        { mealType: 'DINNER', share: 0.3, order: 2 },
      ]
  }
}

// ─────────────────────── Exclusion engine ───────────────────────

export function isExcludedByTokens(food: PoolFood, tokens: string[]): boolean {
  if (tokens.length === 0) return false
  const hay = normalizeFaSearch(food.nameFa + ' ' + food.searchText)
  return tokens.some((t) => t.length >= 2 && hay.includes(t))
}

export function structuralExcluded(food: PoolFood, allergy: string): boolean {
  const hay = normalizeFaSearch(food.nameFa + ' ' + food.searchText)
  for (const rule of structuralRulesFor(allergy)) {
    if (rule.categories?.includes(food.category)) return true
    if ((rule.nameHas ?? []).some((w) => hay.includes(normalizeFaSearch(w)))) return true
  }
  return false
}

/** Build hard-exclusion tokens (allergies + dislikes) — normalized once. */
export function hardTokens(allergies: string[], disliked: string[]): string[] {
  const raw = [...allergies, ...disliked]
  return raw
    .flatMap((a) => normalizeFaSearch(a).split(/\s+/))
    .filter((t) => t.length >= 2)
}

export function dietExcluded(food: PoolFood, diets: string[]): boolean {
  const hay = normalizeFaSearch(food.nameFa + ' ' + food.searchText)
  for (const d of diets) {
    if (d === 'VEGAN' || d === 'VEGETARIAN') {
      if (MEAT_WORDS.some((w) => hay.includes(w))) return true
      if (d === 'VEGAN' && DAIRY_EGG_WORDS.some((w) => hay.includes(w))) return true
      if (d === 'VEGAN' && food.category === 'DAIRY') return true
    }
    if (d === 'HALAL' || d === 'NORMAL' || d === 'HIGH_PROTEIN') continue
    if (d === 'GLUTEN_FREE') {
      if (food.category === 'BREAD') return true
      if (['نان', 'حلیم', 'آش رشته', 'بیسکویت', 'سوپ جو'].some((w) => hay.includes(w))) return true
    }
    if (d === 'KETO' || d === 'LOW_CARB') {
      if (['RICE', 'BREAD', 'SWEET', 'FAST_FOOD'].includes(food.category)) return true
    }
  }
  return false
}

function carbPerServing(food: PoolFood): number {
  const grams = food.servings[0]?.grams ?? 100
  return (food.carbsPer100g * grams) / 100
}

// ─────────────────────── Pool construction ───────────────────────

export async function loadPool(): Promise<PoolFood[]> {
  const foods = await db.food.findMany({
    where: { isPublic: true, source: 'SEED' },
    include: { servings: true },
  })
  return foods.map((f) => ({
    id: f.id,
    nameFa: f.nameFa,
    searchText: f.searchText,
    category: f.category,
    kcalPer100g: f.kcalPer100g,
    proteinPer100g: f.proteinPer100g,
    carbsPer100g: f.carbsPer100g,
    fatPer100g: f.fatPer100g,
    servings: f.servings.map((s) => ({ labelFa: s.labelFa, grams: s.grams })),
  }))
}

/**
 * Filter with graceful relaxation:
 *  1. allergies + dislikes — never relaxed (safety)
 *  2. diet prefs — relaxed only if pool empties
 *  3. budget — relaxed first
 */
export function filterPool(pool: PoolFood[], ctx: PlannerContext): PoolFood[] {
  const hard = hardTokens(ctx.allergies, ctx.dislikedFoods)
  const applyAll = (relaxBudget: boolean, relaxDiet: boolean, relaxCarb: boolean) =>
    pool.filter((f) => {
      if (isExcludedByTokens(f, hard)) return false
      if (ctx.allergies.some((a) => structuralExcluded(f, a))) return false
      if (ctx.pregnancy && normalizeFaSearch(f.nameFa).includes('دل و جگر')) return false
      if (!relaxDiet && dietExcluded(f, ctx.dietPreferences)) return false
      if ((ctx.dietPreferences.includes('KETO') || ctx.dietPreferences.includes('LOW_CARB')) && !relaxCarb) {
        if (carbPerServing(f) > 25) return false
      }
      if (!relaxBudget && ctx.budgetLevel === 'ECONOMY' && ECONOMY_EXCLUDE.some((w) => normalizeFaSearch(f.nameFa).includes(w))) return false
      return true
    })

  let out = applyAll(false, false, false)
  if (out.length < 4) out = applyAll(true, false, false)
  if (out.length < 4) out = applyAll(true, true, false)
  if (out.length < 4) out = applyAll(true, true, true)
  return out
}

/** Plain rice (چلو/کته) is a companion, never the main dish itself. */
const PLAIN_RICE_NAMES = ['چلو', 'کته برنج']
const isPlainRice = (f: PoolFood) => PLAIN_RICE_NAMES.some((n) => normalizeFaSearch(f.nameFa).startsWith(normalizeFaSearch(n)))

function rolePool(pool: PoolFood[], role: Role): PoolFood[] {
  const byName = (names: string[]) =>
    pool.filter((f) => names.some((n) => normalizeFaSearch(f.nameFa).includes(normalizeFaSearch(n))))
  const cat = (cs: string[]) => pool.filter((f) => cs.includes(f.category))

  if (role === 'BREAKFAST') {
    const mains = byName(BREAKFAST_MAIN_NAMES)
    const sides = [...cat(BREAKFAST_SIDE_CATEGORIES), ...byName(BREAKFAST_SIDE_NAMES)]
    return [...mains, ...sides]
  }
  if (role === 'SNACK') return [...cat(SNACK_CATEGORIES), ...byName(SNACK_NAMES)]
  if (role === 'LUNCH') return [...cat(['MAIN_DISH']), ...cat(['RICE']).filter((f) => !isPlainRice(f)), ...cat(['PROTEIN'])]
  // DINNER: lighter options first
  const lights = byName(LIGHT_DINNER_NAMES)
  const rest = [...cat(['MAIN_DISH']), ...cat(['RICE']).filter((f) => !isPlainRice(f)), ...cat(['PROTEIN'])].filter(
    (f) => !lights.includes(f),
  )
  return [...lights, ...rest]
}

// ─────────────────────── Selection ───────────────────────

const kcalOf = (f: PoolFood, grams: number) => (f.kcalPer100g * grams) / 100

function bestServing(f: PoolFood, targetKcal: number): { serving: { labelFa: string; grams: number }; kcal: number } | null {
  if (f.servings.length === 0) return null
  let best = f.servings[0]
  let bestDiff = Math.abs(kcalOf(f, best.grams) - targetKcal)
  for (const s of f.servings) {
    const kcal = kcalOf(f, s.grams)
    const diff = Math.abs(kcal - targetKcal)
    // Prefer servings that don't overshoot wildly
    const adjusted = kcal > targetKcal * 1.5 ? diff + 500 : diff
    if (adjusted < bestDiff) {
      best = s
      bestDiff = adjusted
    }
  }
  return { serving: best, kcal: Math.round(kcalOf(f, best.grams)) }
}

function macroFor(f: PoolFood, grams: number) {
  const k = grams / 100
  return {
    kcal: Math.round(f.kcalPer100g * k),
    proteinG: Math.round(f.proteinPer100g * k),
    carbsG: Math.round(f.carbsPer100g * k),
    fatG: Math.round(f.fatPer100g * k),
  }
}

export interface PlannedItem {
  foodId: string | null
  titleFa: string
  grams: number | null
  servingLabel: string | null
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  mealType: SlotSpec['mealType']
  order: number
}

/**
 * Pick one food close to targetKcal. Recent picks are EXCLUDED outright (not
 * merely penalized) so used mains never reappear — with a safe fallback when
 * exclusion would empty the pool. Among the remaining, the TOP-K best-fitting
 * candidates rotate via `offset % K` for deterministic variety.
 */
function pickFood(
  pool: PoolFood[],
  targetKcal: number,
  offset: number,
  recentIds: string[],
  liked: string[],
): PoolFood | null {
  if (pool.length === 0) return null
  const fresh = pool.filter((f) => !recentIds.includes(f.id))
  const work = fresh.length > 0 ? fresh : pool
  const likedNorm = liked.map((l) => normalizeFaSearch(l))
  const scored = work
    .map((f) => {
      const serving = bestServing(f, targetKcal)
      const kcal = serving?.kcal ?? Math.round(kcalOf(f, 100))
      const fit = Math.abs(kcal - targetKcal) / Math.max(targetKcal, 1)
      const likedBoost = likedNorm.some((l) => l.length >= 2 && normalizeFaSearch(f.nameFa).includes(l)) ? -0.35 : 0
      return { food: f, score: fit + likedBoost }
    })
    .sort((a, b) => a.score - b.score)
  const K = Math.min(3, scored.length)
  const idx = ((offset % K) + K) % K
  return scored[idx].food
}

/** Bread/dairy/fruit-style companions — never another full main dish. */
function sidePoolFor(pool: PoolFood[], kind: 'RICE' | 'LIGHT'): PoolFood[] {
  return kind === 'RICE'
    ? pool.filter((f) => f.category === 'RICE')
    : pool.filter((f) => f.category === 'BREAD' || f.category === 'VEGETABLE' || f.category === 'FRUIT')
}

const BREAKFAST_SIDE_NAMES_N = BREAKFAST_SIDE_NAMES.map((n) => normalizeFaSearch(n))

function breakfastSidePool(pool: PoolFood[]): PoolFood[] {
  return pool.filter(
    (f) => f.category === 'BREAD' || BREAKFAST_SIDE_NAMES_N.some((n) => normalizeFaSearch(f.nameFa).includes(n)),
  )
}

/** Generate all items for one day. `recentIds` is shared across the week (mutated) to avoid repeats. */
export function planDay(
  pool: PoolFood[],
  ctx: PlannerContext,
  slots: SlotSpec[],
  rotation: number,
  recentIds: string[] = [],
): PlannedItem[] {
  const items: PlannedItem[] = []
  const recent = recentIds

  for (const slot of slots) {
    const target = Math.max(80, Math.round(ctx.targets.kcal * slot.share))
    const isMainSlot = slot.mealType === 'LUNCH' || slot.mealType === 'DINNER'
    const mainTarget = isMainSlot ? Math.round(target * 0.75) : target
    let remaining = target

    // Breakfast must lead with a real main (عدسی/املت/حلیم…) — sides only as fallback
    let mainPool = rolePool(pool, slot.mealType)
    if (slot.mealType === 'BREAKFAST') {
      const mains = mainPool.filter((f) =>
        BREAKFAST_MAIN_NAMES.some((n) => normalizeFaSearch(f.nameFa).includes(normalizeFaSearch(n))),
      )
      if (mains.length > 0) mainPool = mains
    }

    const pushItem = (food: PoolFood, grams: number, label: string) => {
      const m = macroFor(food, grams)
      items.push({
        foodId: food.id,
        titleFa: food.nameFa,
        grams,
        servingLabel: label,
        ...m,
        mealType: slot.mealType,
        order: slot.order,
      })
      remaining -= m.kcal
      recent.push(food.id)
    }

    const main = pickFood(mainPool, mainTarget, rotation + slot.order * 7, recent, ctx.likedFoods)
    if (main) {
      const picked = bestServing(main, mainTarget)
      if (picked) pushItem(main, picked.serving.grams, picked.serving.labelFa)
    }

    // Stew → serve with rice (Iranian plate). Main under target → bread/salad side
    // from the FULL filtered pool (breads/salads don't live in the main-dish pool).
    if (isMainSlot && remaining > 140) {
      const needsRice = normalizeFaSearch(main?.nameFa ?? '').startsWith(STEW_PREFIX)
      const sides = sidePoolFor(pool, needsRice ? 'RICE' : 'LIGHT')
      const side = pickFood(sides, Math.min(remaining, 250), rotation + slot.order * 3, recent, ctx.likedFoods)
      if (side) {
        const picked = bestServing(side, Math.min(remaining, 250))
        if (picked) pushItem(side, picked.serving.grams, picked.serving.labelFa)
      }
    }

    // Breakfast companion (پنیر/کره/عسل/نان) when room allows — sides only, no mains
    if (slot.mealType === 'BREAKFAST' && remaining > 120) {
      const sides = breakfastSidePool(pool).filter((f) => f.id !== main?.id && !items.some((it) => it.foodId === f.id))
      const side = pickFood(sides, Math.min(remaining, 160), rotation + slot.order * 5, recent, ctx.likedFoods)
      if (side) {
        const picked = bestServing(side, Math.min(remaining, 160))
        if (picked) pushItem(side, picked.serving.grams, picked.serving.labelFa)
      }
    }

    // Top-up (any slot): fruit/yogurt/nuts until within ~180 kcal of the slot target
    let guard = 0
    while (remaining > 180 && items.filter((it) => it.mealType === slot.mealType).length < 3 && guard < 2) {
      guard++
      const inSlot = new Set(items.filter((it) => it.mealType === slot.mealType).map((it) => it.foodId))
      const topUps = pool.filter(
        (f) => !inSlot.has(f.id) && ['FRUIT', 'DAIRY', 'SNACK', 'VEGETABLE'].includes(f.category),
      )
      const extra = pickFood(topUps, Math.min(remaining, 200), rotation + guard * 13, recent, ctx.likedFoods)
      if (!extra) break
      const picked = bestServing(extra, Math.min(remaining, 200))
      if (!picked) break
      pushItem(extra, picked.serving.grams, picked.serving.labelFa)
    }
  }

  // Keep only the last few picks so the repeat-avoidance window stays short.
  if (recent.length > 8) recent.splice(0, recent.length - 8)
  return items
}

/** Last-resort fallback item when even the relaxed pool is empty (e.g. extreme allergy). */
export function fallbackItem(slot: SlotSpec): PlannedItem {
  return {
    foodId: null,
    titleFa: slot.mealType === 'SNACK' ? 'میوه فصل' : 'غذای ساده خانگی',
    grams: null,
    servingLabel: 'یک واحد متوسط',
    kcal: slot.mealType === 'SNACK' ? 80 : 400,
    proteinG: slot.mealType === 'SNACK' ? 1 : 20,
    carbsG: slot.mealType === 'SNACK' ? 18 : 45,
    fatG: slot.mealType === 'SNACK' ? 0 : 12,
    mealType: slot.mealType,
    order: slot.order,
  }
}

/** Full 7-day generation. `generationSeed` changes on every regenerate. */
export function generateWeek(pool: PoolFood[], ctx: PlannerContext, generationSeed: number): PlannedItem[][] {
  const slots = slotsForMealsPerDay(ctx.mealsPerDay)
  const recent: string[] = [] // shared across days — mains never repeat back-to-back
  const days: PlannedItem[][] = []
  for (let d = 0; d < 7; d++) {
    const dayItems = planDay(pool, ctx, slots, generationSeed + d * 11, recent)
    days.push(
      dayItems.length >= slots.length
        ? dayItems
        : [...dayItems, ...slots.slice(dayItems.length).map(fallbackItem)],
    )
  }
  return days
}

/** Deterministic single-item swap: same slot role, kcal within ±45%, not the same food. */
export function findSwap(
  pool: PoolFood[],
  ctx: PlannerContext,
  mealType: string,
  currentFoodId: string | null,
  currentKcal: number,
  usedIdsSameMeal: (string | null)[],
): PlannedItem | null {
  const role: Role =
    mealType === 'BREAKFAST' || mealType === 'LUNCH' || mealType === 'DINNER' || mealType === 'SNACK'
      ? mealType
      : 'SNACK'
  const poolForRole = rolePool(pool, role).filter((f) => f.id !== currentFoodId && !usedIdsSameMeal.includes(f.id))
  const near = poolForRole.filter((f) => {
    const picked = bestServing(f, currentKcal)
    return picked !== null && Math.abs(picked.kcal - currentKcal) <= Math.max(90, currentKcal * 0.45)
  })
  const list = near.length > 0 ? near : poolForRole
  const chosen = pickFood(list, currentKcal, Math.floor(Date.now() / 60_000) % 97, [], ctx.likedFoods)
  if (!chosen) return null
  const picked = bestServing(chosen, currentKcal)
  if (!picked) return null
  return {
    foodId: chosen.id,
    titleFa: chosen.nameFa,
    grams: picked.serving.grams,
    servingLabel: picked.serving.labelFa,
    ...macroFor(chosen, picked.serving.grams),
    mealType: role,
    order: 0,
  }
}
