import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { ApiError } from '@/lib/api'

/**
 * Admin panel session — separate from the user session on purpose:
 * the /admin panel belongs to the app owner, with its own password
 * (ADMIN_PASSWORD) and its own short HMAC token (no DB row needed).
 *
 * Token format: `${expMs}.${hmacHex}` where hmacHex = HMAC-SHA256(expMs, key)
 * and key = sha256(ADMIN_SESSION_SECRET + ':' + ADMIN_PASSWORD). Because the
 * password is part of the key, changing it instantly invalidates old sessions.
 */

const ADMIN_COOKIE = 'fita_admin'
const MAX_AGE_SEC = 7 * 24 * 60 * 60 // 7 days
const FALLBACK_PASSWORD = 'Fita@1404'

function adminPassword(): string {
  return process.env.ADMIN_PASSWORD ?? FALLBACK_PASSWORD
}

let cachedKey: Buffer | null = null
function sessionKey(): Buffer {
  if (!cachedKey) {
    const secret = process.env.ADMIN_SESSION_SECRET ?? ''
    cachedKey = createHash('sha256')
      .update(`${secret}:${adminPassword()}`, 'utf8')
      .digest()
  }
  return cachedKey
}

function signExpMs(expMs: string): string {
  return createHmac('sha256', sessionKey()).update(expMs, 'utf8').digest('hex')
}

function verifyAdminToken(token: string | undefined): boolean {
  if (!token) return false
  const dot = token.indexOf('.')
  if (dot <= 0) return false
  const expMs = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  if (!/^\d+$/.test(expMs)) return false
  if (Number(expMs) <= Date.now()) return false
  const expected = Buffer.from(signExpMs(expMs), 'utf8')
  const provided = Buffer.from(sig, 'utf8')
  if (expected.length !== provided.length) return false
  return timingSafeEqual(expected, provided)
}

/** Same https-proxy awareness as the user session: SameSite=None; Secure behind the HTTPS gateway, Lax on plain http. */
async function isBehindHttps(): Promise<boolean> {
  try {
    const h = await headers()
    const proto = (h.get('x-forwarded-proto') ?? '').split(',')[0].trim()
    return proto === 'https'
  } catch {
    return false
  }
}

function adminCookieOptions(https: boolean, maxAge: number) {
  return {
    httpOnly: true,
    sameSite: https ? ('none' as const) : ('lax' as const),
    secure: https,
    path: '/',
    maxAge,
  }
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const store = await cookies()
  return verifyAdminToken(store.get(ADMIN_COOKIE)?.value)
}

/** Guard for admin API routes — throws 401 ApiError when not signed in. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdminAuthenticated())) {
    throw new ApiError(401, 'ADMIN_AUTH_REQUIRED', 'برای این بخش ابتدا وارد شو.')
  }
}

export async function setAdminSessionCookie(): Promise<void> {
  const expMs = String(Date.now() + MAX_AGE_SEC * 1000)
  const token = `${expMs}.${signExpMs(expMs)}`
  const store = await cookies()
  store.set(ADMIN_COOKIE, token, adminCookieOptions(await isBehindHttps(), MAX_AGE_SEC))
}

export async function clearAdminSessionCookie(): Promise<void> {
  const store = await cookies()
  store.set(ADMIN_COOKIE, '', adminCookieOptions(await isBehindHttps(), 0))
}

/** Constant-time password check (sha256 digests, both always 32 bytes). */
export function verifyAdminPassword(password: string): boolean {
  const provided = createHash('sha256').update(password, 'utf8').digest()
  const expected = createHash('sha256').update(adminPassword(), 'utf8').digest()
  return timingSafeEqual(provided, expected)
}
