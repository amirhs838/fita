import { NextRequest } from 'next/server'
import { ApiError, handleError, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'

/**
 * DELETE /api/diary/log/[id]
 * Ownership-checked removal of a log (items cascade at the schema level).
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser()
    const { id } = await ctx.params

    const log = await db.foodLog.findUnique({ where: { id }, select: { userId: true } })
    if (!log) throw new ApiError(404, 'LOG_NOT_FOUND', 'این ثبت پیدا نشد.')
    if (log.userId !== user.id) throw new ApiError(403, 'FORBIDDEN', 'اجازه حذف این ثبت را نداری.')

    await db.foodLog.delete({ where: { id } })
    return ok({ deleted: true })
  } catch (err) {
    return handleError(err)
  }
}
