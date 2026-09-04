'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp'
import { api, ApiClientError, setToken } from '@/lib/client'
import type { RequestOtpData, VerifyOtpData } from '@/lib/types'
import { formatPhone, normalizePhone, enDigits } from '@/lib/phone'
import { Logo } from '@/components/app/Logo'

const RESEND_SECONDS = 60

type Step = 'phone' | 'otp'

export function AuthScreen({ onAuthed }: { onAuthed: () => void }) {
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [canonicalPhone, setCanonicalPhone] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [devCode, setDevCode] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)
  const codeInputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setInterval(() => setResendIn((s) => s - 1), 1000)
    return () => clearInterval(t)
  }, [resendIn])

  function errorMessage(err: unknown): string {
    return err instanceof ApiClientError ? err.message : 'خطای غیرمنتظره‌ای رخ داد. دوباره تلاش کن.'
  }

  async function sendCode() {
    setError('')
    const canonical = normalizePhone(phone)
    if (!canonical) {
      setError('شماره موبایل معتبر نیست. مثال: 09123456789')
      return
    }
    setLoading(true)
    try {
      const data = await api<RequestOtpData>('/api/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      })
      setCanonicalPhone(canonical)
      setDevCode(data.devCode ?? null)
      setStep('otp')
      setCode('')
      setResendIn(RESEND_SECONDS)
      setTimeout(() => codeInputRef.current?.focus(), 150)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function verify() {
    setError('')
    if (code.replace(/\D/g, '').length !== 6) {
      setError('کد 6 رقمی را کامل وارد کن.')
      return
    }
    setLoading(true)
    try {
      const data = await api<VerifyOtpData>('/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ phone: canonicalPhone, code }),
      })
      // Persist Bearer fallback for contexts that block cookies (preview iframe).
      setToken(data.token)
      onAuthed()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background px-7 pb-10 pt-28 sm:border-x">
      {step === 'phone' ? (
        <motion.div
          key="phone"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="flex flex-1 flex-col"
        >
          <div className="mb-14">
            <Logo className="text-4xl" />
            <h1 className="mt-6 text-[22px] font-bold leading-8">تغذیه‌ات را هوشمند و ساده مدیریت کن</h1>
            <p className="mt-1.5 text-sm leading-7 text-muted-foreground">
              با عکس، کالری و مواد مغذی غذاها را ثبت کن؛ فیتا بقیه کارها را انجام می‌دهد.
            </p>
          </div>

          <label htmlFor="phone" className="mb-2 block text-[13px] font-medium text-muted-foreground">
            شماره موبایل
          </label>
          <Input
            id="phone"
            dir="ltr"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0912 345 6789"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !loading && void sendCode()}
            className="tnum h-14 rounded-2xl border-border/80 bg-card text-center text-lg tracking-widest"
            disabled={loading}
          />
          {error && <p className="mt-2.5 text-[13px] text-destructive">{error}</p>}

          <Button
            onClick={() => void sendCode()}
            disabled={loading}
            size="lg"
            className="mt-6 w-full rounded-full font-bold"
          >
            {loading && <Loader2 className="animate-spin" aria-hidden />}
            دریافت کد تأیید
          </Button>

          <div className="mt-auto flex items-center justify-center gap-1.5 pt-12 text-[11px] leading-5 text-muted-foreground">
            <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
            <span>ورود امن با شماره موبایل؛ اطلاعات تو فقط برای خودت محفوظ است.</span>
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="otp"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="flex flex-1 flex-col"
        >
          <h1 className="text-[22px] font-bold leading-8">کد تأیید را وارد کن</h1>
          <p className="tnum mt-1.5 text-sm text-muted-foreground">
            کد 6 رقمی به {enDigits(formatPhone(canonicalPhone))} ارسال شد
          </p>

          {devCode && (
            <div className="tnum mt-5 rounded-2xl bg-muted/60 px-4 py-3 text-[13px] text-muted-foreground">
              حالت دمو — کد تأیید: <span className="font-bold text-foreground">{enDigits(devCode)}</span>
            </div>
          )}

          <div ref={codeInputRef} dir="ltr" className="mt-7 flex justify-start">
            <InputOTP maxLength={6} value={code} onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} disabled={loading}>
              <InputOTPGroup className="gap-2.5">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className="h-14 w-11 rounded-2xl border border-border/80 bg-card text-xl font-bold shadow-none first:border-l last:border-r transition-all data-[active=true]:border-primary data-[active=true]:bg-brand-soft data-[active=true]:ring-0"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
          {error && <p className="mt-2.5 text-[13px] text-destructive">{error}</p>}

          <Button
            onClick={() => void verify()}
            disabled={loading}
            size="lg"
            className="mt-7 w-full rounded-full font-bold"
          >
            {loading && <Loader2 className="animate-spin" aria-hidden />}
            تأیید و ورود
          </Button>

          <div className="mt-5 flex items-center justify-between text-[13px]">
            <button
              type="button"
              onClick={() => {
                setStep('phone')
                setError('')
              }}
              className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
            >
              تغییر شماره
            </button>
            {resendIn > 0 ? (
              <span className="tnum text-xs text-muted-foreground">
                ارسال مجدد تا {enDigits(resendIn)} ثانیه
              </span>
            ) : (
              <button
                type="button"
                onClick={() => void sendCode()}
                disabled={loading}
                className="cursor-pointer font-bold underline underline-offset-4 disabled:opacity-50"
              >
                ارسال مجدد کد
              </button>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}
