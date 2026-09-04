import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ApiError, clientIp, handleError, ok } from '@/lib/api'
import { rateLimit } from '@/lib/rate-limit'
import { setAdminSessionCookie, verifyAdminPassword } from '@/lib/admin-auth'

/** POST /api/admin/login — owner sign-in with the shared panel password. */
export async function POST(req: NextRequest) {
  try {
    // Brute-force guard before anything else.
    const rl = rateLimit(`admin-login:${clientIp(req)}`, 10, 60_000)
    if (!rl.allowed) {
      throw new ApiError(429, 'RATE_LIMITED', 'تلاش‌های زیاد. کمی بعد دوباره تلاش کن.')
    }

    const body = z.object({ password: z.string().min(1).max(200) }).parse(await req.json())

    if (!verifyAdminPassword(body.password)) {
      throw new ApiError(401, 'INVALID_PASSWORD', 'رمز عبور اشتباه است.')
    }

    await setAdminSessionCookie()
    return ok({ authed: true })
  } catch (err) {
    return handleError(err)
  }
}
