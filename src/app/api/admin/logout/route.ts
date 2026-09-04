import { NextRequest } from 'next/server'
import { clientIp, handleError, ok } from '@/lib/api'
import { rateLimit } from '@/lib/rate-limit'
import { clearAdminSessionCookie } from '@/lib/admin-auth'

/** POST /api/admin/logout — clears the admin cookie. */
export async function POST(req: NextRequest) {
  try {
    const rl = rateLimit(`admin-logout:${clientIp(req)}`, 30, 60_000)
    if (!rl.allowed) {
      return ok({ authed: false })
    }

    await clearAdminSessionCookie()
    return ok({ authed: false })
  } catch (err) {
    return handleError(err)
  }
}
