import { SignJWT, jwtVerify } from 'jose'
import { cookies, headers } from 'next/headers'
import { db } from '@/lib/db'
import { AppConfig } from '@/lib/config'
import { ApiError } from '@/lib/api'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'fita-dev-secret-change-me',
)

export async function signSession(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${AppConfig.session.ttlDays}d`)
    .sign(secret)
}

/**
 * When the app is served behind the HTTPS gateway (preview panel / production),
 * it may run inside a cross-site iframe. SameSite=Lax cookies are dropped in
 * that context, so we use SameSite=None; Secure there. Plain http (local dev)
 * keeps Lax — browsers reject None without Secure.
 */
async function isBehindHttps(): Promise<boolean> {
  try {
    const h = await headers()
    const proto = (h.get('x-forwarded-proto') ?? '').split(',')[0].trim()
    return proto === 'https'
  } catch {
    return false
  }
}

function cookieOptions(https: boolean, maxAge: number) {
  return {
    httpOnly: true,
    sameSite: https ? ('none' as const) : ('lax' as const),
    secure: https,
    path: '/',
    maxAge,
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies()
  store.set(
    AppConfig.session.cookieName,
    token,
    cookieOptions(await isBehindHttps(), AppConfig.session.ttlDays * 24 * 60 * 60),
  )
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies()
  store.set(AppConfig.session.cookieName, '', cookieOptions(await isBehindHttps(), 0))
}

async function verifyToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret)
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

/** Authorization: Bearer fallback for environments that block cookies (preview iframe, ITP browsers). */
async function bearerUserId(): Promise<string | null> {
  try {
    const h = await headers()
    const auth = h.get('authorization')
    if (!auth) return null
    const [scheme, token] = auth.split(' ')
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null
    return verifyToken(token.trim())
  } catch {
    return null
  }
}

export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies()
  const cookieToken = store.get(AppConfig.session.cookieName)?.value
  if (cookieToken) {
    const fromCookie = await verifyToken(cookieToken)
    if (fromCookie) return fromCookie
  }
  return bearerUserId()
}

/** Loads the session user with profile/subscription/stats. Returns null when unauthenticated. */
export async function getSessionUser() {
  const id = await getSessionUserId()
  if (!id) return null
  return db.user.findUnique({
    where: { id },
    include: { profile: true, subscription: true, stats: true },
  })
}

/** Guard for API routes — throws 401 ApiError when unauthenticated. */
export async function requireUser() {
  const user = await getSessionUser()
  if (!user || user.status !== 'ACTIVE') {
    throw new ApiError(401, 'UNAUTHENTICATED', 'ابتدا وارد حساب شو.')
  }
  return user
}
