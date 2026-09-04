import { z } from 'zod'
import { AiError, getAiProvider } from '@/lib/ai/gateway'
import { MEAL_PLAN_SYSTEM_PROMPT } from '@/lib/ai/prompts'
import { extractJson } from '@/lib/ai/scan'
import type { CuratedFood, PlanSlot } from '@/lib/meal-plan/curated'
import type { PlannerTargets } from '@/lib/meal-plan/planner'

/**
 * AI week picker (Task 9-b) — the model CHOOSES; it never computes nutrition.
 * Each candidate gets a short code; the model returns code + grams per slot
 * per day. Every returned code is resolved back to a real curated food and
 * invalid/unknown picks are dropped — deterministic fallback fills the gaps.
 */

export interface AiSlotInput {
  mealType: PlanSlot
  share: number
  required: boolean
  candidates: { code: string; food: CuratedFood }[]
}

const AiItemSchema = z.object({
  mealType: z.enum(['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER']),
  code: z.string().trim().min(1).max(8),
  grams: z.number().min(20).max(1200),
})

const AiPlanSchema = z.object({
  days: z
    .array(z.object({ items: z.array(AiItemSchema).max(10) }))
    .min(1)
    .max(7),
})

export type AiWeek = (Map<PlanSlot, { foodId: string; grams: number }> | null)[]

const SLOT_PREFIX: Record<PlanSlot, string> = {
  BREAKFAST: 'B',
  LUNCH: 'L',
  SNACK: 'S',
  DINNER: 'D',
}

export function codeFor(slot: PlanSlot, index: number): string {
  return `${SLOT_PREFIX[slot]}${index + 1}`
}

export async function pickWeekWithAi(
  slots: AiSlotInput[],
  targets: PlannerTargets,
  avoid: string[],
): Promise<AiWeek> {
  const provider = await getAiProvider()

  const payload = {
    dailyTargets: {
      kcal: Math.round(targets.kcal),
      proteinG: Math.round(targets.proteinG),
      carbG: Math.round(targets.carbG),
      fatG: Math.round(targets.fatG),
    },
    avoid: avoid.slice(0, 20),
    slots: slots.map((s) => ({
      mealType: s.mealType,
      required: s.required,
      shareOfDailyKcal: Math.round(s.share * 100) / 100,
      candidates: s.candidates.map(({ code, food }) => ({
        code,
        name: food.nameFa,
        kcalPer100g: Math.round(food.kcalPer100g),
        proteinPer100g: Math.round(food.proteinPer100g),
        carbsPer100g: Math.round(food.carbsPer100g),
        fatPer100g: Math.round(food.fatPer100g),
        servings: food.servings.slice(0, 3),
      })),
    })),
  }

  // Resolve codes → real foods once; anything unresolvable is dropped later.
  const byKey = new Map<string, CuratedFood>()
  for (const s of slots) {
    for (const { code, food } of s.candidates) byKey.set(`${s.mealType}:${code}`, food)
  }

  let lastError: AiError = new AiError('AI_INVALID_RESPONSE', 'پاسخ نامعتبر از مدل.')
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await provider.completeText({
        system: MEAL_PLAN_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
        json: true,
        maxTokens: 1800,
      })
      const parsed = AiPlanSchema.safeParse(extractJson(raw))
      if (!parsed.success) {
        lastError = new AiError('AI_INVALID_RESPONSE', 'ساختار برنامه‌ی مدل نامعتبر بود.')
        continue
      }
      const days: AiWeek = Array.from({ length: 7 }, () => null)
      parsed.data.days.slice(0, 7).forEach((day, dayIndex) => {
        const map = new Map<PlanSlot, { foodId: string; grams: number }>()
        for (const item of day.items) {
          const slotInput = slots.find((s) => s.mealType === item.mealType)
          if (!slotInput) continue
          const food = byKey.get(`${item.mealType}:${item.code.toUpperCase()}`)
          if (!food) continue
          const grams = Math.min(1200, Math.max(20, Math.round(item.grams)))
          map.set(item.mealType, { foodId: food.id, grams })
        }
        if (map.size > 0) days[dayIndex] = map
      })
      if (days.every((d) => d === null)) {
        lastError = new AiError('AI_INVALID_RESPONSE', 'هیچ انتخاب معتبری از مدل نرسید.')
        continue
      }
      return days
    } catch (err) {
      if (err instanceof AiError) lastError = err
      else lastError = new AiError('AI_UNAVAILABLE', 'سرویس هوش مصنوعی موقتاً در دسترس نیست.')
    }
  }
  throw lastError
}
