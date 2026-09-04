import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ApiError, handleError, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { isValidDayKey } from '@/lib/date'
import { db } from '@/lib/db'

const QuerySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })

/**
 * GET /api/diary?date=YYYY-MM-DD
 * All food logs for the day (grouped client-side by mealType) with per-item
 * macro snapshots — deterministic values computed at log time, never re-estimated.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser()
    const parsed = QuerySchema.safeParse({ date: req.nextUrl.searchParams.get('date') ?? '' })
    if (!parsed.success || !isValidDayKey(parsed.data.date)) {
      throw new ApiError(400, 'INVALID_DATE', 'تاریخ نامعتبر است.')
    }
    const date = parsed.data.date

    const logs = await db.foodLog.findMany({
      where: { userId: user.id, date },
      orderBy: { createdAt: 'asc' },
      include: { items: { orderBy: { id: 'asc' } } },
    })

    return ok({
      date,
      logs: logs.map((l) => ({
        id: l.id,
        mealType: l.mealType,
        source: l.source,
        note: l.note,
        createdAt: l.createdAt.toISOString(),
        items: l.items.map((it) => ({
          id: it.id,
          foodId: it.foodId,
          nameFa: it.nameFa,
          grams: it.grams,
          servingLabel: it.servingLabel,
          kcal: it.kcal,
          proteinG: it.proteinG,
          carbsG: it.carbsG,
          fatG: it.fatG,
          fiberG: it.fiberG,
          confidence: it.confidence,
        })),
      })),
    })
  } catch (err) {
    return handleError(err)
  }
}
