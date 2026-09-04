import { z } from 'zod'
import { NextRequest } from 'next/server'
import { ApiError, clientIp, handleError, ok } from '@/lib/api'
import { normalizePhone } from '@/lib/phone'
import { rateLimit } from '@/lib/rate-limit'
import { verifyOtp } from '@/lib/otp'
import { ensureUserDependencies } from '@/lib/signup'
import { setSessionCookie, signSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { toEnglishDigits } from '@/lib/phone'

const BodySchema = z.object({
  phone: z.string().min(4).max(20),
  code: z
    .string()
    .transform((v) => toEnglishDigits(v).replace(/\D/g, ''))
    .pipe(z.string().length(6)),
})

export async function POST(req: NextRequest) {
  try {
    const { phone: rawPhone, code } = BodySchema.parse(await req.json())
    const phone = normalizePhone(rawPhone)
    if (!phone) throw new ApiError(400, 'INVALID_PHONE', 'شماره موبایل معتبر نیست.')

    const attemptLimit = rateLimit(`otp:verify:${phone}`, 10, 10 * 60_000)
    const ipLimit = rateLimit(`otp:verify:ip:${clientIp(req)}`, 30, 10 * 60_000)
    if (!attemptLimit.allowed || !ipLimit.allowed) {
      throw new ApiError(429, 'VERIFY_RATE_LIMIT', 'تلاش‌های زیادی انجام شده. کمی بعد دوباره تلاش کن.')
    }

    await verifyOtp(phone, code)

    // Login or signup — both flows converge here.
    let user = await db.user.findUnique({ where: { phone } })
    if (!user) {
      user = await db.user.create({ data: { phone } })
    }
    await ensureUserDependencies(user.id)

    const token = await signSession(user.id)
    await setSessionCookie(token)

    const profile = await db.userProfile.findUnique({ where: { userId: user.id } })

    return ok({
      user: { id: user.id, phone: user.phone, name: user.name },
      onboarded: Boolean(profile?.onboardedAt),
      // Cookie is primary; this token powers the Bearer fallback when cookies are blocked (iframe preview).
      token,
    })
  } catch (err) {
    return handleError(err)
  }
}
