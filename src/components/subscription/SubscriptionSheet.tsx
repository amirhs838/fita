'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BadgeCheck,
  CalendarDays,
  Camera,
  Check,
  Crown,
  Loader2,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api, ApiClientError } from '@/lib/client'
import { enDigits } from '@/lib/phone'
import { cn } from '@/lib/utils'
import type { SubscriptionData } from '@/lib/types'

interface SubscriptionSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after a successful activation so the shell can refresh /api/me. */
  onSubscribed: () => void
}

type Phase = 'loading' | 'choose' | 'paying' | 'success'

function faToman(n: number): string {
  return `${enDigits(n.toLocaleString('en-US'))} تومان`
}

function faDate(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('fa-IR-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(
      new Date(iso),
    )
  } catch {
    return ''
  }
}

/**
 * Phase 10 paywall — plan chooser + checkout. In this environment the payment
 * provider is `mock` (instant success) so the flow reads as a simulated
 * gateway; with a real provider the checkout returns a redirectUrl instead.
 */
export function SubscriptionSheet({ open, onOpenChange, onSubscribed }: SubscriptionSheetProps) {
  const [sub, setSub] = useState<SubscriptionData | null>(null)
  const [selected, setSelected] = useState<string>('PRO_YEARLY')
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      setPhase('loading')
      setError(null)
      api<SubscriptionData>('/api/subscription')
        .then((d) => {
          if (!cancelled) {
            setSub(d)
            setPhase('choose')
          }
        })
        .catch(() => {
          if (!cancelled) {
            setError('اطلاعات اشتراک بارگذاری نشد.')
            setPhase('choose')
          }
        })
    })
    return () => {
      cancelled = true
    }
  }, [open])

  async function checkout() {
    if (!sub) return
    setPhase('paying')
    setError(null)
    try {
      const res = await api<SubscriptionData & { referenceId?: string; status?: string; redirectUrl?: string | null }>(
        '/api/subscription/checkout',
        { method: 'POST', body: JSON.stringify({ planId: selected }) },
      )
      if (res.redirectUrl) {
        window.location.href = res.redirectUrl
        return
      }
      setSub(res)
      setPhase('success')
      onSubscribed()
      toast.success('اشتراک فیتا پلاس فعال شد')
    } catch (err) {
      setPhase('choose')
      setError(
        err instanceof ApiClientError ? err.message : 'پرداخت انجام نشد. دوباره تلاش کن.',
      )
    }
  }

  const isPro = sub?.tier === 'PRO'

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onOpenChange(false)
      }}
    >
      <SheetContent
        side="bottom"
        className="rounded-t-[28px] px-5 pb-8 pt-3 sm:max-w-md sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2"
      >
        <SheetHeader className="px-1 text-start">
          <SheetTitle className="text-lg font-bold">اشتراک فیتا</SheetTitle>
          <SheetDescription className="text-[13px]">
            {phase === 'success' ? 'همه امکانات برایت باز شد' : 'دسترسی کامل به همه امکانات فیتا'}
          </SheetDescription>
        </SheetHeader>

        {phase === 'loading' && (
          <div className="space-y-3 pt-2">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-12 rounded-xl" />
          </div>
        )}

        {phase === 'success' && (
          <div className="flex flex-col items-center py-6" aria-live="polite">
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground"
            >
              <BadgeCheck className="size-8" aria-hidden />
            </motion.span>
            <p className="mt-4 text-base font-bold">اشتراک فیتا پلاس فعال شد</p>
            {sub?.proExpiresAt && (
              <p className="tnum mt-1 text-xs text-muted-foreground">
                تا {faDate(sub.proExpiresAt)} — اسکن و مربی نامحدود
              </p>
            )}
            <Button
              className="mt-6 h-12 w-full rounded-full font-bold"
              onClick={() => onOpenChange(false)}
            >
              بریم ثبت غذا
            </Button>
          </div>
        )}

        {(phase === 'choose' || phase === 'paying') && sub && !isPro && (
          <div className="space-y-4">
            {/* Current state */}
            {sub.tier === 'FREE_TRIAL' && (
              <div className="flex items-center gap-3 rounded-2xl bg-muted/60 p-4">
                <CalendarDays className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden />
                <p className="text-xs leading-5">
                  <span className="block font-bold">دوره آزمایشی فعال است</span>
                  <span className="tnum text-muted-foreground">
                    {sub.trialDaysLeft !== null
                      ? `${enDigits(sub.trialDaysLeft)} روز باقی‌مانده`
                      : ''}
                    {' · '}
                    {sub.scansRemaining !== null
                      ? `${enDigits(sub.scansRemaining)} اسکن از ${enDigits(sub.scansLimit)}`
                      : ''}
                  </span>
                </p>
              </div>
            )}
            {sub.tier === 'EXPIRED' && (
              <div
                role="alert"
                className="rounded-2xl bg-destructive/5 p-4 text-xs leading-5"
              >
                <span className="block font-bold text-destructive">دسترسی‌های فیتا تمام شده</span>
                <span className="text-muted-foreground">
                  برای ادامه اسکن غذا، مربی هوشمند و برنامه غذایی، فیتا پلاس را فعال کن.
                </span>
              </div>
            )}

            {/* Plan picker */}
            <div className="space-y-2" role="radiogroup" aria-label="انتخاب پلن">
              {sub.plans.map((p) => {
                const active = selected === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setSelected(p.id)}
                    className={cn(
                      'relative flex w-full cursor-pointer items-start gap-3 rounded-2xl border p-4 text-start transition-all active:scale-[0.99]',
                      active ? 'border-primary bg-brand-soft/50 ring-1 ring-primary' : 'border-border/80 hover:bg-muted/30',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border',
                        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                      )}
                    >
                      {active && <Check className="size-3" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-bold">{p.titleFa}</span>
                        {p.badgeFa && (
                          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] text-brand-strong">
                            {p.badgeFa}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{p.subtitleFa}</span>
                      {p.discountPct !== null && (
                        <span className="tnum mt-1 block text-[11px] text-muted-foreground">
                          معادل {faToman(p.perMonthToman)} در ماه ({enDigits(p.discountPct)}٪ کمتر)
                        </span>
                      )}
                    </span>
                    <span className="tnum shrink-0 text-sm font-black">{faToman(p.priceToman)}</span>
                  </button>
                )
              })}
            </div>

            {/* Features */}
            <ul className="divide-y divide-border/60 rounded-2xl bg-muted/40 px-4">
              {(sub.plans[0]?.featuresFa ?? []).map((f) => (
                <li key={f} className="flex items-center gap-2.5 py-2.5 text-xs">
                  <Check className="size-3.5 shrink-0" aria-hidden />
                  {f}
                </li>
              ))}
            </ul>

            {error && (
              <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-2.5 text-xs text-destructive">
                {error}
              </p>
            )}

            <Button
              onClick={() => void checkout()}
              disabled={phase === 'paying'}
              className="h-13 w-full rounded-full text-sm font-bold"
            >
              {phase === 'paying' ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Crown className="size-4" aria-hidden />
              )}
              فعال‌سازی فیتا پلاس
            </Button>

            <p className="flex items-start justify-center gap-1.5 text-center text-[11px] leading-5 text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              محیط آزمایشی: پرداخت شبیه‌سازی می‌شود و مبلغی کسر نمی‌گردد. اتصال درگاه واقعی با
              PAYMENT_PROVIDER انجام می‌شود.
            </p>
          </div>
        )}

        {(phase === 'choose' || phase === 'paying') && sub && isPro && (
          <div className="flex flex-col items-center py-6">
            <span className="flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand-strong">
              <Crown className="size-6" aria-hidden />
            </span>
            <p className="mt-3 text-base font-bold">فیتا پلاس فعال است</p>
            {sub.proExpiresAt && (
              <p className="tnum mt-1 text-xs text-muted-foreground">
                تا {faDate(sub.proExpiresAt)}
              </p>
            )}
            <div className="mt-5 w-full divide-y divide-border/60 rounded-2xl bg-muted/40 px-4">
              {(sub.plans[0]?.featuresFa ?? []).map((f) => (
                <p key={f} className="flex items-center gap-2.5 py-2.5 text-xs">
                  <Check className="size-3.5 shrink-0" aria-hidden />
                  {f}
                </p>
              ))}
            </div>
            <Button variant="outline" className="mt-5 h-12 w-full rounded-full" onClick={() => onOpenChange(false)}>
              <Camera className="size-4" aria-hidden />
              اسکن غذا
            </Button>
          </div>
        )}

        {(phase === 'choose' || phase === 'paying') && !sub && error && (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
