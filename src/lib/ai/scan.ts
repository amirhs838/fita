import { z } from 'zod'
import { db } from '@/lib/db'
import { AiError, getAiProvider } from '@/lib/ai/gateway'
import { SCAN_SYSTEM_PROMPT } from '@/lib/ai/prompts'
import { normalizeFaSearch } from '@/lib/food-search'

/**
 * Food Scan pipeline (AI.md §2):
 *   image → vision provider → structured JSON → zod validate (1 retry)
 *         → match each food against the Food DB (fuzzy fa/en)
 *         → matched: nutrition from DB · unmatched: Food row source=AI_ESTIMATE
 *   Numbers on committed logs are ALWAYS computed server-side from per-100g
 *   rows — the model only proposes food + grams (never writes nutrition math).
 *   Image bytes live in memory for the duration of one request and are never
 *   persisted to disk or DB.
 */

// ─────────────────────── AI response contract ───────────────────────

const Per100gSchema = z.object({
  kcal: z.number().min(0).max(950),
  protein: z.number().min(0).max(100),
  carbs: z.number().min(0).max(100),
  fat: z.number().min(0).max(100),
})

const AiFoodSchema = z.object({
  name: z.string().trim().min(1).max(80),
  nameFa: z.string().trim().min(1).max(80),
  estimatedGrams: z.number().min(5).max(2000),
  confidence: z.number().min(0).max(1),
  per100g: Per100gSchema,
})

/** What the model is asked to return: ONE dish card (or isFood:false). */
const AiDishCardSchema = z.object({
  isFood: z.boolean(),
  name: z.string().trim().max(80).default(''),
  nameFa: z.string().trim().max(80).default(''),
  estimatedGrams: z.number().min(0).max(2000).default(0),
  confidence: z.number().min(0).max(1).default(0),
  per100g: Per100gSchema.partial().default({}),
})

export const ScanResponseSchema = z.object({
  foods: z.array(AiFoodSchema).max(1),
  overallConfidence: z.number().min(0).max(1),
})

export type AiFood = z.infer<typeof AiFoodSchema>
export type ScanResponse = z.infer<typeof ScanResponseSchema>

/**
 * Normalize whatever the model actually said into the ONE-dish contract:
 *  - new shape      {isFood, name…, per100g}  → 0 or 1 foods
 *  - legacy shape   {foods:[…]}               → dominant item by kcal contribution
 *    (older prompt listed plate components separately; professional apps
 *    report one meal card, so we keep only the dominant component)
 */
export function normalizeScanOutput(raw: unknown): { foods: AiFood[]; overallConfidence: number } {
  if (raw && typeof raw === 'object' && Array.isArray((raw as { foods?: unknown }).foods)) {
    const legacy = z
      .object({ foods: z.array(AiFoodSchema).min(1).max(10), overallConfidence: z.number().min(0).max(1).optional() })
      .safeParse(raw)
    if (legacy.success) {
      const dominant = [...legacy.data.foods].sort(
        (a, b) => b.estimatedGrams * b.per100g.kcal - a.estimatedGrams * a.per100g.kcal,
      )[0]
      return {
        foods: [dominant],
        overallConfidence: legacy.data.overallConfidence ?? dominant.confidence,
      }
    }
  }

  const card = AiDishCardSchema.safeParse(raw)
  if (!card.success) {
    throw new AiError('AI_INVALID_RESPONSE', 'ساختار پاسخ مدل نامعتبر بود.')
  }
  const d = card.data
  if (!d.isFood || !d.nameFa || !d.name) {
    return { foods: [], overallConfidence: d.isFood ? d.confidence : 0 }
  }
  const per100g = {
    kcal: d.per100g.kcal ?? 0,
    protein: d.per100g.protein ?? 0,
    carbs: d.per100g.carbs ?? 0,
    fat: d.per100g.fat ?? 0,
  }
  const dish = AiFoodSchema.safeParse({
    name: d.name,
    nameFa: d.nameFa,
    estimatedGrams: d.estimatedGrams,
    confidence: d.confidence,
    per100g,
  })
  if (!dish.success) {
    throw new AiError('AI_INVALID_RESPONSE', 'ساختار پاسخ مدل نامعتبر بود.')
  }
  return { foods: [dish.data], overallConfidence: dish.data.confidence }
}

/** Model outputs sometimes arrive wrapped in ```json fences or prose. */
export function extractJson(raw: string): unknown {
  const stripped = raw.replace(/```(?:json)?/gi, '').trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new AiError('AI_INVALID_RESPONSE', 'پاسخ مدل قابل تفسیر نبود.')
  }
  try {
    return JSON.parse(stripped.slice(start, end + 1))
  } catch {
    throw new AiError('AI_INVALID_RESPONSE', 'پاسخ مدل قابل تفسیر نبود.')
  }
}

/**
 * Analyze one image with the vision provider. zod-validates the response and
 * retries ONCE on invalid/unavailable output before giving up (AI.md §1).
 */
export async function runFoodScan(imageDataUrl: string): Promise<ScanResponse> {
  const provider = await getAiProvider()
  let lastError: AiError = new AiError('AI_INVALID_RESPONSE', 'پاسخ نامعتبر از مدل.')

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await provider.analyzeImage({
        system: SCAN_SYSTEM_PROMPT,
        imageDataUrl,
        maxTokens: 900,
      })
      const parsed = normalizeScanOutput(extractJson(raw))
      return parsed
    } catch (err) {
      if (err instanceof AiError) lastError = err
      else
        lastError = new AiError('AI_UNAVAILABLE', 'سرویس بینایی موقتاً در دسترس نیست.')
    }
  }
  throw lastError
}

// ─────────────────────── Food DB matching ───────────────────────

export interface FoodMatchRow {
  id: string
  nameFa: string
  nameEn: string | null
  searchText: string
  isPublic: boolean
  createdByUserId: string | null
}

function tokens(s: string): string[] {
  return normalizeFaSearch(s).split(/[\s,،.()\-\u200c]+/).filter((t) => t.length > 1)
}

/** Overlap score in [0,1]: how much of the AI name is covered by the DB name. */
function matchScore(aiName: string, dbFood: FoodMatchRow): number {
  const aiTokens = [...new Set([...tokens(aiName)])]
  if (aiTokens.length === 0) return 0
  const dbHaystack = normalizeFaSearch(`${dbFood.nameFa} ${dbFood.nameEn ?? ''} ${dbFood.searchText}`)
  const exact = normalizeFaSearch(aiName)
  if (exact.length > 2 && dbHaystack.includes(exact)) return 1
  let hits = 0
  for (const t of aiTokens) if (dbHaystack.includes(t)) hits++
  return hits / aiTokens.length
}

/**
 * Fuzzy-match an AI-identified food against the DB the user may see
 * (public seed foods + their own AI-created rows). Threshold keeps
 * false matches out — unmatched items become AI_ESTIMATE rows instead.
 */
export async function matchFoodToDb(
  aiName: string,
  nameFa: string,
  userId: string,
): Promise<FoodMatchRow | null> {
  const candidates = await db.food.findMany({
    where: { OR: [{ isPublic: true }, { createdByUserId: userId }] },
    select: { id: true, nameFa: true, nameEn: true, searchText: true, isPublic: true, createdByUserId: true },
  })
  if (candidates.length === 0) return null

  const names = [aiName, nameFa]
  let best: FoodMatchRow | null = null
  let bestScore = 0
  for (const food of candidates) {
    const score = Math.max(matchScore(names[0], food), matchScore(names[1], food))
    if (score > bestScore) {
      bestScore = score
      best = food
    }
  }
  return bestScore >= 0.5 ? best : null
}

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * Resolve an AI food to a DB row: reuse a fuzzy match, or create a
 * user-private Food row flagged source=AI_ESTIMATE with the model's typical
 * per-100g reference (which then feeds the deterministic log math).
 */
export async function ensureFoodFromScan(
  item: AiFood,
  userId: string,
): Promise<{
  foodId: string
  nameFa: string
  kcalPer100g: number
  proteinPer100g: number
  carbsPer100g: number
  fatPer100g: number
  matched: boolean
}> {
  const match = await matchFoodToDb(item.name, item.nameFa, userId)
  if (match) {
    const food = await db.food.findUniqueOrThrow({
      where: { id: match.id },
      select: {
        id: true,
        nameFa: true,
        kcalPer100g: true,
        proteinPer100g: true,
        carbsPer100g: true,
        fatPer100g: true,
      },
    })
    return { foodId: food.id, nameFa: food.nameFa, kcalPer100g: food.kcalPer100g, proteinPer100g: food.proteinPer100g, carbsPer100g: food.carbsPer100g, fatPer100g: food.fatPer100g, matched: true }
  }

  const nameFa = item.nameFa.slice(0, 80)
  const food = await db.food.create({
    data: {
      nameFa,
      nameEn: item.name.slice(0, 80),
      category: 'OTHER',
      foodType: 'DISH',
      isIranian: /[\u0600-\u06FF]/.test(item.nameFa),
      source: 'AI_ESTIMATE',
      confidence: Math.min(0.9, Math.max(0.1, item.confidence)),
      searchText: normalizeFaSearch(`${nameFa} ${item.name}`),
      kcalPer100g: round1(item.per100g.kcal),
      proteinPer100g: round1(item.per100g.protein),
      carbsPer100g: round1(item.per100g.carbs),
      fatPer100g: round1(item.per100g.fat),
      isPublic: false,
      createdByUserId: userId,
    },
    select: {
      id: true,
      nameFa: true,
      kcalPer100g: true,
      proteinPer100g: true,
      carbsPer100g: true,
      fatPer100g: true,
    },
  })
  return { foodId: food.id, nameFa: food.nameFa, kcalPer100g: food.kcalPer100g, proteinPer100g: food.proteinPer100g, carbsPer100g: food.carbsPer100g, fatPer100g: food.fatPer100g, matched: false }
}
