import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ApiError, handleError, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { normalizeFaSearch } from '@/lib/food-search'
import { AiError } from '@/lib/ai/gateway'
import { guessFoodFromText } from '@/lib/ai/guess'
import { matchFoodToDb } from '@/lib/ai/scan'
import { db } from '@/lib/db'
import type { FoodDto } from '@/lib/types'

const BodySchema = z.object({
  query: z.string().trim().min(2).max(120),
})

const round1 = (n: number) => Math.round(n * 10) / 10

function toFoodDto(f: {
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
  imageUrl: string | null
  servings: { id: string; labelFa: string; unitType: string; grams: number; isDefault: boolean }[]
}): FoodDto {
  return {
    id: f.id,
    nameFa: f.nameFa,
    nameEn: f.nameEn,
    category: f.category,
    isIranian: f.isIranian,
    source: f.source,
    confidence: f.confidence,
    kcalPer100g: f.kcalPer100g,
    proteinPer100g: f.proteinPer100g,
    carbsPer100g: f.carbsPer100g,
    fatPer100g: f.fatPer100g,
    imageUrl: f.imageUrl,
    servings: f.servings.map((s) => ({
      id: s.id,
      labelFa: s.labelFa,
      unitType: s.unitType,
      grams: s.grams,
      isDefault: s.isDefault,
    })),
  }
}

/**
 * POST /api/foods/ai-guess
 * Search-list fallback: when the food DB has no match, the AI proposes the
 * identity, a typical Iranian serving and the per-100g reference. The result
 * is persisted (source=AI_ESTIMATE) so the next search finds it — the food
 * bank fills itself as users log unknown dishes.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()

    const rl = rateLimit(`ai-guess:${user.id}`, 10, 60_000)
    if (!rl.allowed) {
      throw new ApiError(429, 'RATE_LIMITED', `درخواست‌های مکرر. ${rl.retryAfterSec} ثانیه دیگر تلاش کن.`)
    }
    const rlIp = rateLimit(
      `ai-guess-ip:${req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'}`,
      30,
      60_000,
    )
    if (!rlIp.allowed) {
      throw new ApiError(429, 'RATE_LIMITED', 'درخواست‌های زیادی ارسال شده. کمی بعد تلاش کن.')
    }

    const body = BodySchema.parse(await req.json())

    let guess
    try {
      guess = await guessFoodFromText(body.query)
    } catch (err) {
      if (err instanceof AiError) throw new ApiError(502, err.code, err.message)
      throw err
    }

    // Reuse an existing row when the guess clearly points at one —
    // repeated guesses never duplicate the bank.
    const match = await matchFoodToDb(guess.name, guess.nameFa, user.id)
    if (match) {
      const food = await db.food.findUnique({
        where: { id: match.id },
        include: { servings: { orderBy: [{ isDefault: 'desc' }, { grams: 'desc' }] } },
      })
      if (food) {
        return ok({ food: toFoodDto(food), matchedToDb: true })
      }
    }

    const nameFa = guess.nameFa.slice(0, 80)
    const created = await db.food.create({
      data: {
        nameFa,
        nameEn: guess.name.slice(0, 80),
        category: guess.category,
        foodType: 'DISH',
        isIranian: guess.isIranian || /[\u0600-\u06FF]/.test(nameFa),
        source: 'AI_ESTIMATE',
        confidence: Math.min(0.9, Math.max(0.1, guess.confidence)),
        searchText: normalizeFaSearch(`${nameFa} ${guess.name}`),
        kcalPer100g: round1(guess.per100g.kcal),
        proteinPer100g: round1(guess.per100g.protein),
        carbsPer100g: round1(guess.per100g.carbs),
        fatPer100g: round1(guess.per100g.fat),
        fiberPer100g: guess.per100g.fiber != null ? round1(guess.per100g.fiber) : null,
        isPublic: true, // generic estimated nutrition — stays searchable so the bank grows
        createdByUserId: user.id,
        servings: {
          create: [
            {
              labelFa: guess.servingLabelFa.slice(0, 40),
              unitType: 'CUSTOM',
              grams: Math.round(guess.servingGrams),
              isDefault: true,
            },
            { labelFa: '100 گرم', unitType: 'GRAM', grams: 100, isDefault: false },
          ],
        },
      },
      include: { servings: { orderBy: [{ isDefault: 'desc' }, { grams: 'desc' }] } },
    })

    return ok({ food: toFoodDto(created), matchedToDb: false })
  } catch (err) {
    return handleError(err)
  }
}
