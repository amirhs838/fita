import { db } from '@/lib/db'
import { normalizeFaSearch } from '@/lib/food-search'
import type { BudgetLevel } from '@/lib/nutrition/engine'
import {
  dietExcluded,
  hardTokens,
  isExcludedByTokens,
  structuralExcluded,
} from './planner'

/**
 * Owner-curated plan pool (برنامه‌ساز, Task 9-b).
 *
 * A food only becomes a meal-plan candidate when the admin tagged it in the
 * /admin panel with a budget tier (Food.budgetLevel) AND meal slots
 * (Food.mealSlotsJson). The AI planner may pick ONLY from this pool — nothing
 * outside the owner's written options — while every kcal/macro number stays
 * deterministic (per-100g × grams / 100, computed here, never by the model).
 *
 * Budget is hierarchical: FLEXIBLE includes all tiers, MID includes
 * ECONOMY+MID, ECONOMY only ECONOMY — so a richer budget never empties the pool.
 */

export type PlanSlot = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK'

const PLAN_SLOTS: PlanSlot[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']

export function isPlanSlot(v: unknown): v is PlanSlot {
  return typeof v === 'string' && (PLAN_SLOTS as string[]).includes(v)
}

export function isBudgetLevel(v: unknown): v is BudgetLevel {
  return v === 'ECONOMY' || v === 'MID' || v === 'FLEXIBLE'
}

export function allowedTiers(budget: BudgetLevel): BudgetLevel[] {
  if (budget === 'ECONOMY') return ['ECONOMY']
  if (budget === 'MID') return ['ECONOMY', 'MID']
  return ['ECONOMY', 'MID', 'FLEXIBLE']
}

export interface CuratedFood {
  id: string
  nameFa: string
  searchText: string
  category: string
  budgetLevel: BudgetLevel
  mealSlots: PlanSlot[]
  kcalPer100g: number
  proteinPer100g: number
  carbsPer100g: number
  fatPer100g: number
  servings: { labelFa: string; grams: number }[]
}

function parseSlots(raw: string | null): PlanSlot[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isPlanSlot)
  } catch {
    return []
  }
}

export async function loadCuratedPool(): Promise<CuratedFood[]> {
  const foods = await db.food.findMany({
    where: { isPublic: true, budgetLevel: { not: null }, mealSlotsJson: { not: null } },
    include: { servings: true },
  })
  return foods
    .map((f) => ({
      id: f.id,
      nameFa: f.nameFa,
      searchText: f.searchText,
      category: f.category,
      budgetLevel: f.budgetLevel as BudgetLevel,
      mealSlots: parseSlots(f.mealSlotsJson),
      kcalPer100g: f.kcalPer100g,
      proteinPer100g: f.proteinPer100g,
      carbsPer100g: f.carbsPer100g,
      fatPer100g: f.fatPer100g,
      servings: f.servings
        .map((s) => ({ labelFa: s.labelFa, grams: s.grams }))
        .sort((a, b) => b.grams - a.grams),
    }))
    .filter((f) => f.mealSlots.length > 0)
}

// ─────────────────────── Slot pools (constraint-first) ───────────────────────

export interface CurationFilters {
  budget: BudgetLevel
  allergies: string[]
  dislikedFoods: string[]
  dietPreferences: string[]
  pregnancy: boolean
}

/**
 * Allergies/dislikes/pregnancy are HARD exclusions (never relaxed). Diet-style
 * filters relax per-slot when the pool would become too small. Budget is
 * enforced through the owner's own tags (hierarchical tiers).
 */
export function buildSlotPools(
  pool: CuratedFood[],
  f: CurationFilters,
): Record<PlanSlot, CuratedFood[]> {
  const tiers = allowedTiers(f.budget)
  const hard = hardTokens(f.allergies, f.dislikedFoods)

  const apply = (relaxDiet: boolean): CuratedFood[] =>
    pool.filter((x) => {
      if (!tiers.includes(x.budgetLevel)) return false
      if (isExcludedByTokens(x, hard)) return false
      if (f.allergies.some((a) => structuralExcluded(x, a))) return false
      if (f.pregnancy && normalizeFaSearch(x.nameFa).includes('دل و جگر')) return false
      if (!relaxDiet && dietExcluded(x, f.dietPreferences)) return false
      return true
    })

  const strict = apply(false)
  const out = {} as Record<PlanSlot, CuratedFood[]>
  for (const slot of PLAN_SLOTS) {
    let p = strict.filter((x) => x.mealSlots.includes(slot))
    if (p.length < 3) {
      const relaxed = apply(true).filter((x) => x.mealSlots.includes(slot))
      if (relaxed.length > p.length) p = relaxed
    }
    out[slot] = p
  }
  return out
}

// ─────────────────────── Deterministic math + fallback ───────────────────────

export function macroFor(food: CuratedFood, grams: number) {
  const k = grams / 100
  return {
    kcal: Math.round(food.kcalPer100g * k),
    proteinG: Math.round(food.proteinPer100g * k),
    carbsG: Math.round(food.carbsPer100g * k),
    fatG: Math.round(food.fatPer100g * k),
  }
}

/** Human serving label whose grams are closest to the planned portion. */
export function bestServingLabel(food: CuratedFood, grams: number): string {
  if (food.servings.length === 0) return `${Math.round(grams)} گرم`
  let best = food.servings[0]
  let bestDiff = Math.abs(best.grams - grams)
  for (const s of food.servings) {
    const diff = Math.abs(s.grams - grams)
    if (diff < bestDiff) {
      best = s
      bestDiff = diff
    }
  }
  return `${best.labelFa} (~${toFa(grams)} گرم)`
}

function toFa(n: number): string {
  return Math.round(n).toLocaleString('fa-IR-u-nu-latn')
}

const likedHit = (food: CuratedFood, liked: string[]) => {
  const hay = normalizeFaSearch(food.nameFa)
  return liked.some((l) => l.length >= 2 && hay.includes(normalizeFaSearch(l)))
}

/**
 * Fallback picker used when the model leaves a slot empty: nearest-kcal
 * candidate with a deterministic rotation offset and repeat avoidance.
 */
export function deterministicPick(
  pool: CuratedFood[],
  targetKcal: number,
  offset: number,
  recentIds: string[],
  liked: string[],
): CuratedFood | null {
  if (pool.length === 0) return null
  const fresh = pool.filter((f) => !recentIds.includes(f.id))
  const work = fresh.length > 0 ? fresh : pool
  const scored = work
    .map((f) => {
      const grams = f.servings[0]?.grams ?? 100
      const kcal = Math.round((f.kcalPer100g * grams) / 100)
      const fit = Math.abs(kcal - targetKcal) / Math.max(targetKcal, 1)
      return { food: f, score: fit + (likedHit(f, liked) ? -0.35 : 0) }
    })
    .sort((a, b) => a.score - b.score)
  const K = Math.min(3, scored.length)
  return scored[((offset % K) + K) % K].food
}

export interface SwapResult {
  foodId: string
  titleFa: string
  grams: number
  servingLabel: string
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
}

/** Deterministic single-item swap inside one slot's curated pool (±45% kcal). */
export function findCuratedSwap(
  candidates: CuratedFood[],
  currentFoodId: string | null,
  currentKcal: number,
  excludeIds: (string | null)[],
  liked: string[],
): SwapResult | null {
  const usable = candidates.filter((f) => f.id !== currentFoodId && !excludeIds.includes(f.id))
  if (usable.length === 0) return null
  const near = usable.filter((f) => {
    const grams = f.servings[0]?.grams ?? 100
    const kcal = Math.round((f.kcalPer100g * grams) / 100)
    return Math.abs(kcal - currentKcal) <= Math.max(90, currentKcal * 0.45)
  })
  const list = near.length > 0 ? near : usable
  const chosen = deterministicPick(list, currentKcal, Math.floor(Date.now() / 60_000) % 97, [], liked)
  if (!chosen) return null
  const grams = chosen.servings[0]?.grams ?? 100
  return {
    foodId: chosen.id,
    titleFa: chosen.nameFa,
    grams,
    servingLabel: bestServingLabel(chosen, grams),
    ...macroFor(chosen, grams),
  }
}
