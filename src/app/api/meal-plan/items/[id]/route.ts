import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ApiError, handleError, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { db } from '@/lib/db'

const BodySchema = z.object({
  status: z.enum(['PLANNED', 'EATEN', 'SKIPPED', 'SWAPPED']),
})

/**
 * PATCH /api/meal-plan/items/:id — mark a planned item as EATEN / SKIPPED /
 * back to PLANNED. (Quantity editing stays deferred — documented residual.)
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser()

    const rl = rateLimit(`plan-item:${user.id}`, 60, 60_000)
    if (!rl.allowed) {
      throw new ApiError(429, 'RATE_LIMITED', `درخواست‌های مکرر. ${rl.retryAfterSec} ثانیه دیگر تلاش کن.`)
    }

    const { id } = await params
    const { status } = BodySchema.parse(await req.json())

    const item = await db.mealPlanItem.findUnique({
      where: { id },
      include: { day: { include: { plan: { select: { userId: true } } } } },
    })
    if (!item || item.day.plan.userId !== user.id) {
      throw new ApiError(404, 'ITEM_NOT_FOUND', 'این مورد در برنامه پیدا نشد.')
    }

    const updated = await db.mealPlanItem.update({
      where: { id },
      data: { status },
    })
    return ok({ item: { id: updated.id, status: updated.status } })
  } catch (err) {
    return handleError(err)
  }
}
