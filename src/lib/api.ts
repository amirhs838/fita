import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

/** Typed API error with a stable machine code + Persian user-facing message. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status })
}

export function fail(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status })
}

/** Uniform error envelope — never leaks internals to clients. */
export function handleError(err: unknown) {
  if (err instanceof ApiError) return fail(err.status, err.code, err.message)
  if (err instanceof ZodError) return fail(422, 'VALIDATION_ERROR', 'ورودی ارسالی معتبر نیست.')
  console.error('[api] unexpected error:', err)
  return fail(500, 'INTERNAL', 'خطای غیرمنتظره‌ای رخ داد. دوباره تلاش کن.')
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
}
