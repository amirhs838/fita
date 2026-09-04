/** Client-side API helper — uniform envelope handling + Bearer session fallback. */

export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

interface Envelope<T> {
  ok: boolean
  data?: T
  error?: { code: string; message: string }
}

/**
 * Session token mirror. Cookies are primary, but the preview panel runs the app
 * inside a cross-site iframe where browsers may block third-party cookies —
 * so verify-otp also returns a JWT that we keep here and send as a Bearer header.
 */
const TOKEN_KEY = 'fita_token'

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // private mode — cookie session still works in normal browsing
  }
}

export function clearToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    // noop
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const baseHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) baseHeaders.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(path, {
      cache: 'no-store',
      ...init,
      headers: { ...baseHeaders, ...(init?.headers as Record<string, string> | undefined) },
    })
  } catch {
    throw new ApiClientError('NETWORK', 'اتصال برقرار نشد. اینترنت را بررسی کن.')
  }

  let json: Envelope<T>
  try {
    json = (await res.json()) as Envelope<T>
  } catch {
    throw new ApiClientError('INTERNAL', 'پاسخ سرور نامعتبر بود.')
  }

  if (!res.ok || !json.ok) {
    throw new ApiClientError(
      json.error?.code ?? 'INTERNAL',
      json.error?.message ?? 'خطای غیرمنتظره‌ای رخ داد.',
    )
  }
  return json.data as T
}
