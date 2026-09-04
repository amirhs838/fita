'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChefHat, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, ApiClientError } from '@/lib/client'

/** Owner sign-in gate for /admin — password only, error shown inline. */
export default function AdminLogin() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (submitting) return
    const pw = password.trim()
    if (pw === '') {
      setError('رمز عبور را وارد کن.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ password: pw }),
      })
      router.refresh()
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'INVALID_PASSWORD') {
        setError('رمز عبور اشتباه است.')
      } else if (err instanceof ApiClientError && err.code === 'RATE_LIMITED') {
        setError(err.message)
      } else {
        setError(err instanceof ApiClientError ? err.message : 'ورود انجام نشد. دوباره تلاش کن.')
      }
      setSubmitting(false)
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-5 pb-16 pt-8">
      <div className="w-full max-w-sm">
        <div className="rounded-3xl border border-border/70 bg-card p-6 shadow-[0_1px_3px_oklch(0.175_0_0/0.05)]">
          {/* Logo */}
          <div className="flex flex-col items-center text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-foreground">
              <ChefHat className="size-7 text-primary-foreground" strokeWidth={1.6} aria-hidden />
            </span>
            <h1 className="mt-4 text-xl font-bold">پنل مدیریت فیتا</h1>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              این بخش مخصوص مدیر است. رمز عبور را وارد کن.
            </p>
          </div>

          <form
            className="mt-6"
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">رمز عبور</span>
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (error) setError(null)
                }}
                placeholder="••••••••"
                className="h-12 rounded-xl text-center"
                aria-invalid={error !== null}
                aria-describedby={error ? 'admin-login-error' : undefined}
                autoFocus
              />
            </label>

            {error && (
              <p id="admin-login-error" role="alert" className="mt-2 text-xs text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" disabled={submitting} className="mt-5 h-12 w-full rounded-full text-base font-bold">
              {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
              ورود
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          <a href="/" className="transition-colors hover:text-foreground">
            برگشت به فیتا
          </a>
        </p>
      </div>
    </div>
  )
}
