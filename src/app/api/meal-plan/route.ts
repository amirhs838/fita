import { NextRequest } from 'next/server'
import { ApiError, handleError, ok } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { getActivePlanDto } from '@/lib/meal-plan/service'

/** GET /api/meal-plan — latest ACTIVE plan (or null → UI shows generate CTA). */
export async function GET(_req: NextRequest) {
  try {
    const user = await requireUser()
    const plan = await getActivePlanDto(user.id)
    return ok({ plan })
  } catch (err) {
    return handleError(err)
  }
}

export async function POST() {
  throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'متد پشتیبانی نمی‌شود.')
}
