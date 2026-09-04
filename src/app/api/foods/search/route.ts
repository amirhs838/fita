import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handleError, ok, ApiError } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { normalizeFaSearch } from '@/lib/food-search'
import { db } from '@/lib/db'

const QuerySchema = z.object({
  q: z.string().max(120).default(''),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

/**
 * GET /api/foods/search?q=&limit=
 * Empty q → curated staples list (browse mode). Non-empty → tokenized AND match
 * over normalized searchText (Persian/Arabic variants unified).
 * Servings included so the client can pick Iranian units without a second call.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser()

    const rl = rateLimit(`food-search:${user.id}`, 90, 60_000)
    if (!rl.allowed) {
      throw new ApiError(429, 'RATE_LIMITED', `درخواست‌های مکرر. ${rl.retryAfterSec} ثانیه دیگر تلاش کن.`)
    }

    const parsed = QuerySchema.safeParse({
      q: req.nextUrl.searchParams.get('q') ?? '',
      limit: req.nextUrl.searchParams.get('limit') ?? 20,
    })
    if (!parsed.success) {
      return ok({ foods: [] })
    }
    const { q: rawQ, limit } = parsed.data
    const q = normalizeFaSearch(rawQ)

    const where = q
      ? {
          isPublic: true,
          AND: q.split(' ').filter(Boolean).map((token) => ({
            searchText: { contains: token },
          })),
        }
      : { isPublic: true, category: { in: ['RICE', 'MAIN_DISH', 'BREAD', 'DAIRY', 'PROTEIN'] } }

    const foods = await db.food.findMany({
      where,
      orderBy: [{ isIranian: 'desc' }, { nameFa: 'asc' }],
      take: limit,
      include: { servings: { orderBy: [{ isDefault: 'desc' }, { grams: 'desc' }] } },
    })

    return ok({
      foods: foods.map((f) => ({
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
      })),
    })
  } catch (err) {
    return handleError(err)
  }
}
