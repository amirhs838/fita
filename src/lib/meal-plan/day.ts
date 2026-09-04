import {
  bestServingLabel,
  deterministicPick,
  macroFor,
  type CuratedFood,
  type PlanSlot,
} from '@/lib/meal-plan/curated'
import type { SlotSpec } from '@/lib/meal-plan/planner'

/**
 * Single-day assembly shared by the weekly generator and the per-day
 * regenerator — one code path so a regenerated day follows the exact same
 * rules as the week it belongs to: AI pick first (validated against the
 * curated pool), deterministic nearest-kcal fallback, same-food-twice guard,
 * and repeat avoidance against a caller-supplied "recent" list.
 */

export interface DayItemDraft {
  mealType: string
  foodId: string
  titleFa: string
  grams: number
  servingLabel: string
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  order: number
}

export interface AssembleDayInput {
  slots: SlotSpec[]
  slotPools: Record<PlanSlot, CuratedFood[]>
  curated: CuratedFood[]
  targetsKcal: number
  likedFoods: string[]
  /** foodIds already used elsewhere (other days) — avoided/demoted, not banned */
  recent: string[]
  /** deterministic tie-break seed (dayIndex or random) */
  seedBase: number
  /** validated AI picks for this day (null → deterministic only) */
  aiDay: Map<PlanSlot, { foodId: string; grams: number }> | null
}

export function assembleDayItems(input: AssembleDayInput): {
  items: DayItemDraft[]
  usedIds: string[]
} {
  const { slots, slotPools, curated, targetsKcal, likedFoods, seedBase, aiDay } = input
  const byId = new Map(curated.map((f) => [f.id, f]))
  const usedToday = new Set<string>()
  const recentLocal = [...input.recent]
  const items: DayItemDraft[] = []

  for (const slot of slots) {
    const pool = slotPools[slot.mealType]
    if (pool.length === 0) continue // optional snack without options → skip

    const aiPick = aiDay?.get(slot.mealType)
    const targetKcal = Math.max(80, Math.round(targetsKcal * slot.share))
    let food: CuratedFood | undefined
    let grams: number

    if (aiPick && byId.has(aiPick.foodId)) {
      const picked = byId.get(aiPick.foodId)
      if (picked && usedToday.has(picked.id)) {
        // Same food twice in one day — swap one deterministically from the
        // not-yet-used pool.
        const alt = deterministicPick(
          pool.filter((f) => !usedToday.has(f.id)),
          targetKcal,
          seedBase * 11 + slot.order * 7,
          recentLocal,
          likedFoods,
        )
        food = alt ?? picked
        grams = alt ? (alt.servings[0]?.grams ?? 100) : Math.max(20, Math.round(aiPick.grams))
      } else {
        food = picked
        grams = Math.max(20, Math.round(aiPick.grams))
      }
    } else {
      food = deterministicPick(pool, targetKcal, seedBase * 11 + slot.order * 7, recentLocal, likedFoods) ?? undefined
      grams = food?.servings[0]?.grams ?? 100
    }
    if (!food) continue

    usedToday.add(food.id)
    recentLocal.push(food.id)

    const m = macroFor(food, grams)
    items.push({
      mealType: slot.mealType,
      foodId: food.id,
      titleFa: food.nameFa,
      grams,
      servingLabel: bestServingLabel(food, grams),
      ...m,
      order: slot.order,
    })
  }

  return { items, usedIds: [...usedToday] }
}

/**
 * Reorder a candidate pool so foods already used on other days of the active
 * plan sit at the END of the listing — the AI model favors early codes, so
 * this softly steers a regenerated day away from repeating its neighbors
 * without banning anything (a small pool must stay fully usable).
 */
export function demoteUsedFirst(pool: CuratedFood[], usedElsewhere: string[]): CuratedFood[] {
  if (usedElsewhere.length === 0) return pool
  const fresh = pool.filter((f) => !usedElsewhere.includes(f.id))
  const used = pool.filter((f) => usedElsewhere.includes(f.id))
  return [...fresh, ...used]
}
