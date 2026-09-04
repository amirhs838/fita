import { z } from 'zod'
import { NextRequest } from 'next/server'
import { ApiError, clientIp, handleError, ok } from '@/lib/api'
import { AppConfig } from '@/lib/config'
import { normalizePhone, enDigits } from '@/lib/phone'
import { rateLimit } from '@/lib/rate-limit'
import { issueOtp } from '@/lib/otp'

const BodySchema = z.object({ phone: z.string().min(4).max(20) })

export async function POST(req: NextRequest) {
  try {
    const { phone: rawPhone } = BodySchema.parse(await req.json())
    const phone = normalizePhone(rawPhone)
    if (!phone) {
      throw new ApiError(400, 'INVALID_PHONE', 'شماره موبایل معتبر نیست. مثال: 09123456789')
    }

    // Abuse limits: 60s cooldown per phone, hourly caps per phone & IP.
    const cooldown = rateLimit(`otp:cool:${phone}`, 1, AppConfig.otp.resendCooldownSeconds * 1000)
    if (!cooldown.allowed) {
      throw new ApiError(429, 'OTP_COOLDOWN', `${enDigits(cooldown.retryAfterSec)} ثانیه دیگر دوباره تلاش کن.`)
    }
    const perPhone = rateLimit(`otp:phone:${phone}`, AppConfig.otp.maxPerHourPerPhone, 3_600_000)
    if (!perPhone.allowed) {
      throw new ApiError(429, 'OTP_PHONE_LIMIT', 'درخواست کد برای این شماره زیاد بوده. کمی بعد تلاش کن.')
    }
    const perIp = rateLimit(`otp:ip:${clientIp(req)}`, AppConfig.otp.maxPerHourPerIp, 3_600_000)
    if (!perIp.allowed) {
      throw new ApiError(429, 'OTP_IP_LIMIT', 'درخواست‌های زیادی ثبت شده. کمی بعد تلاش کن.')
    }

    const { devCode } = await issueOtp(phone)

    return ok({
      expiresIn: AppConfig.otp.ttlSeconds,
      ...(devCode ? { devCode } : {}),
    })
  } catch (err) {
    return handleError(err)
  }
}
