import { z } from 'zod'
import { AiError, getAiProvider } from '@/lib/ai/gateway'
import { FOOD_GUESS_SYSTEM_PROMPT } from '@/lib/ai/prompts'
import { extractJson } from '@/lib/ai/scan'

/**
 * Food Guess pipeline — the search-list fallback (AI.md §2):
 *   free text → text provider → structured JSON → zod validate (1 retry)
 * The model only proposes identity + typical serving + per-100g reference;
 * deterministic log math still happens in the diary code path.
 */

const AiGuessSchema = z.object({
  name: z.string().trim().min(1).max(80),
  nameFa: z.string().trim().min(1).max(80),
  servingLabelFa: z.string().trim().min(1).max(40),
  servingGrams: z.number().min(5).max(1500),
  isIranian: z.boolean(),
  category: z.enum([
    'MAIN_DISH',
    'RICE',
    'BREAD',
    'DAIRY',
    'FRUIT',
    'VEGETABLE',
    'PROTEIN',
    'SNACK',
    'DRINK',
    'FAST_FOOD',
    'SWEET',
    'OTHER',
  ]),
  per100g: z.object({
    kcal: z.number().min(0).max(950),
    protein: z.number().min(0).max(100),
    carbs: z.number().min(0).max(100),
    fat: z.number().min(0).max(100),
    fiber: z.number().min(0).max(50).nullable().optional(),
  }),
  confidence: z.number().min(0).max(1),
})

export type AiGuess = z.infer<typeof AiGuessSchema>

/**
 * Guess one food from free Persian text. zod-validates the response and
 * retries ONCE on invalid/unavailable output before giving up (AI.md §1).
 */
export async function guessFoodFromText(query: string): Promise<AiGuess> {
  const provider = await getAiProvider()
  let lastError: AiError = new AiError('AI_INVALID_RESPONSE', 'پاسخ نامعتبر از مدل.')

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await provider.completeText({
        system: FOOD_GUESS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: query.slice(0, 120) }],
        json: true,
        maxTokens: 400,
      })
      const parsed = AiGuessSchema.safeParse(extractJson(raw))
      if (parsed.success) return parsed.data
      lastError = new AiError('AI_INVALID_RESPONSE', 'ساختار پاسخ مدل نامعتبر بود.')
    } catch (err) {
      if (err instanceof AiError) lastError = err
      else lastError = new AiError('AI_UNAVAILABLE', 'سرویس هوش مصنوعی موقتاً در دسترس نیست.')
    }
  }
  throw lastError
}
