import { createHash, randomInt } from 'crypto'
import { db } from '@/lib/db'
import { AppConfig } from '@/lib/config'
import { ApiError } from '@/lib/api'

/**
 * OTP issue/verify.
 * `dev` provider echoes the code (development only). A real SMS gateway later
 * replaces `sendCode` — a one-function change.
 */

function hashCode(phone: string, code: string): string {
  const salt = process.env.JWT_SECRET ?? 'fita-dev-secret-change-me'
  return createHash('sha256').update(`${phone}:${code}:${salt}`).digest('hex')
}

function generateCode(): string {
  const min = 10 ** (AppConfig.otp.codeLength - 1)
  return String(randomInt(min, min * 10))
}

export async function issueOtp(phone: string): Promise<{ devCode?: string }> {
  // Invalidate any previous unconsumed codes for this phone.
  await db.otpCode.updateMany({
    where: { phone, consumedAt: null },
    data: { consumedAt: new Date() },
  })

  const code = generateCode()
  await db.otpCode.create({
    data: {
      phone,
      codeHash: hashCode(phone, code),
      expiresAt: new Date(Date.now() + AppConfig.otp.ttlSeconds * 1000),
    },
  })

  if (AppConfig.otp.provider === 'dev') {
    console.log(`[otp] DEV code for ${phone}: ${code}`)
    return { devCode: code }
  }

  // TODO(phase 11+): plug real SMS provider here (e.g. Kavenegar/SMS.ir).
  throw new ApiError(500, 'OTP_PROVIDER_UNAVAILABLE', 'سرویس پیامک هنوز متصل نشده است.')
}

export async function verifyOtp(phone: string, code: string): Promise<void> {
  const rec = await db.otpCode.findFirst({
    where: { phone, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  })

  if (!rec) {
    throw new ApiError(400, 'NO_PENDING_CODE', 'کد فعالی برای این شماره پیدا نشد. دوباره درخواست کد بده.')
  }
  if (rec.expiresAt.getTime() < Date.now()) {
    throw new ApiError(400, 'CODE_EXPIRED', 'کد منقضی شده است. کد جدید بگیر.')
  }
  if (rec.attempts >= AppConfig.otp.maxAttempts) {
    throw new ApiError(429, 'CODE_LOCKED', 'تلاش‌های بیش از حد. کد جدید بگیر.')
  }
  if (hashCode(phone, code) !== rec.codeHash) {
    await db.otpCode.update({ where: { id: rec.id }, data: { attempts: { increment: 1 } } })
    throw new ApiError(400, 'CODE_INVALID', 'کد وارد شده درست نیست.')
  }

  await db.otpCode.update({ where: { id: rec.id }, data: { consumedAt: new Date() } })
}
