'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Bell,
  CalendarDays,
  Camera,
  ChevronLeft,
  Clock,
  Droplets,
  Info,
  LineChart,
  Plus,
  Sparkles,
  UtensilsCrossed,
  Flame,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ErrorState, SkeletonBlock } from '@/components/fita/States'
import { api } from '@/lib/client'
import type {
  ComputedTargetsData,
  DailyTargets,
  MealPlanData,
  MeData,
  ReminderAction,
  ReminderDto,
  RemindersData,
  SummaryData,
} from '@/lib/types'
import { faDate, todayIso } from '@/lib/date'
import { enDigits } from '@/lib/phone'
import { MEAL_LABEL } from '@/lib/labels'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const WATER_TARGET_ML = 2000
const GLASS_ML = 250

/** Hero entrance — one calm stagger, reduced-motion aware. */
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const containerV = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
}
const itemV = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
}

/** Count-up for dominant numbers (mount 0→value, then value→value on change). */
function useCountUp(value: number, duration = 900): number {
  const reduced = useReducedMotion()
  const [animated, setAnimated] = useState<number | null>(null)
  const fromRef = useRef<number | null>(null)

  useEffect(() => {
    if (reduced) return
    const from = fromRef.current ?? 0
    if (from === value) return
    const start = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setAnimated(Math.round(from + (value - from) * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      fromRef.current = value
    }
  }, [value, duration, reduced])

  return reduced ? value : (animated ?? 0)
}

const fmt = (n: number) => enDigits(Math.round(n).toLocaleString('en-US'))

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'شب بخیر'
  if (h < 12) return 'صبح بخیر'
  if (h < 17) return 'ظهر بخیر'
  if (h < 21) return 'عصر بخیر'
  return 'شب بخیر'
}

interface HomeTabProps {
  me: MeData
  onGoProfile: () => void
  onOpenScan: () => void
  onReminderAction: (action: ReminderAction) => void
  onGoPlan: () => void
}

export function HomeTab({ me, onGoProfile, onOpenScan, onReminderAction, onGoPlan }: HomeTabProps) {
  const reduced = useReducedMotion()
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [reminders, setReminders] = useState<ReminderDto[]>([])
  const [plan, setPlan] = useState<MealPlanData | null>(null)

  useEffect(() => {
    let cancelled = false
    api<SummaryData>(`/api/summary?date=${todayIso()}`)
      .then((d) => {
        if (!cancelled) setSummary(d)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
    api<RemindersData>('/api/reminders')
      .then((d) => {
        if (!cancelled) setReminders(d.reminders)
      })
      .catch(() => {
        // reminders are best-effort — silence is fine
      })
    api<{ plan: MealPlanData | null }>('/api/meal-plan')
      .then((d) => {
        if (!cancelled) setPlan(d.plan)
      })
      .catch(() => {
        // next-meal hint is best-effort
      })
    return () => {
      cancelled = true
    }
  }, [])

  const firstName = me.user.name?.split(' ')[0]
  const targets = summary?.targets as ComputedTargetsData | undefined
  const consumed = summary?.consumed
  const remaining = targets ? targets.kcal - (consumed?.kcal ?? 0) : 0
  const over = remaining < 0
  const consumedPct = targets && targets.kcal > 0 ? Math.min(100, ((consumed?.kcal ?? 0) / targets.kcal) * 100) : 0

  // Water — local mirror of summary.waterMl so quick-adds feel instant
  const [waterMl, setWaterMl] = useState<number | null>(null)
  const [waterBusy, setWaterBusy] = useState(false)
  const effectiveWater = waterMl ?? summary?.waterMl ?? 0

  const addWater = useCallback(async () => {
    if (waterBusy) return
    const prev = waterMl ?? summary?.waterMl ?? 0
    setWaterBusy(true)
    setWaterMl(prev + GLASS_ML) // optimistic
    try {
      const d = await api<{ waterMl: number; awards: unknown[] }>('/api/water', {
        method: 'POST',
        body: JSON.stringify({ date: todayIso(), amountMl: GLASS_ML }),
      })
      setWaterMl(d.waterMl)
      if (Array.isArray(d.awards) && d.awards.length > 0) {
        const { toastAwards } = await import('@/lib/awards-toast')
        toastAwards(d.awards as Parameters<typeof toastAwards>[0])
      }
    } catch {
      setWaterMl(prev)
      toast.error('ثبت آب انجام نشد — دوباره تلاش کن.')
    } finally {
      setWaterBusy(false)
    }
  }, [waterBusy, waterMl, summary?.waterMl])

  // Next planned meal from today's plan day (best-effort)
  const nextMealItem = (() => {
    if (!plan) return null
    const day = plan.days.find((d) => d.date === todayIso())
    if (!day) return null
    const order = ['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER'] as const
    for (const meal of order) {
      const item = day.items.find((it) => it.mealType === meal && it.status !== 'EATEN')
      if (item) return item
    }
    return null
  })()

  // One deterministic daily insight — the only "analytics" on this screen
  const insight = (() => {
    if (!targets || !consumed) return null
    const proteinLeft = targets.proteinG - consumed.proteinG
    if (over) return 'امروز از بودجه کالری عبور کردی — فردا سبک‌تر پیش برو.'
    if (proteinLeft > 15)
      return `برای رسیدن به هدف پروتئینت حدود ${fmt(Math.round(proteinLeft / 5) * 5)} گرم دیگر نیاز داری.`
    if (effectiveWater < 1200 && new Date().getHours() >= 12)
      return 'آب امروزت کم است — یک لیوان آب حالا خوب است.'
    if (remaining > 0 && remaining < 500)
      return `${fmt(Math.round(remaining / 10) * 10)} کالری برای امروز مانده — یک شام سبک جا می‌شود.`
    return 'روز خوبی است — با ثبت منظم، روندت دقیق‌تر می‌شود.'
  })()

  return (
    <motion.div variants={containerV} initial={reduced ? false : 'hidden'} animate="show" className="space-y-6">
      {/* ── Greeting ── */}
      <motion.header variants={itemV}>
        <h1 className="text-[24px] font-extrabold leading-9 tracking-tight">
          {greeting()}
          {firstName ? `، ${firstName}` : ''}
        </h1>
        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <CalendarDays className="size-3.5" strokeWidth={1.7} aria-hidden />
          {faDate()}
        </p>
      </motion.header>

      {me.subscription.tier === 'FREE_TRIAL' && trialCountdown(me.subscription.trialEndsAt) && (
        <motion.p variants={itemV} className="-mt-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 text-[11px] font-bold text-brand-strong">
            <Clock className="size-3.5" strokeWidth={1.8} aria-hidden />
            {trialCountdown(me.subscription.trialEndsAt)} از دوره آزمایشی فیتا باقی مانده
          </span>
        </motion.p>
      )}

      {reminders.length > 0 && (
        <motion.section variants={itemV} aria-label="یادآورهای امروز" className="-mt-1 space-y-px">
          {reminders.map((r) => (
            <ReminderRow key={r.id} reminder={r} onAction={onReminderAction} />
          ))}
        </motion.section>
      )}

      {!summary || !targets ? (
        loadError ? (
          <ErrorState
            title="اهداف روزانه در دسترس نیست"
            description="اتصالت را بررسی کن یا پروفایل را تکمیل کن."
            onRetry={() => window.location.reload()}
          />
        ) : (
          <HomeSkeleton />
        )
      ) : (
        <>
          {/* ── Today — the one dominant card: ring + macros on deep Marine ── */}
          <TodayCard
            remaining={remaining}
            over={over}
            consumedPct={consumedPct}
            targets={targets}
            consumed={consumed ?? { kcal: 0, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0 }}
          />

          {/* ── Bento row — water + next meal ── */}
          <motion.div variants={itemV} className="grid grid-cols-2 gap-3">
            <WaterCard
              waterMl={effectiveWater}
              busy={waterBusy}
              onAdd={() => void addWater()}
            />
            <NextMealCard item={nextMealItem} onGoPlan={onGoPlan} />
          </motion.div>

          {/* ── Scan — hero action ── */}
          <motion.button
            variants={itemV}
            type="button"
            onClick={onOpenScan}
            whileTap={{ scale: 0.985 }}
            className="group relative flex w-full cursor-pointer items-center gap-4 overflow-hidden rounded-3xl bg-energy p-5 text-start text-foreground shadow-[0_14px_32px_-14px_var(--energy)]"
            aria-label="غذا را اسکن کن"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -end-8 -top-10 size-28 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.35),transparent_70%)]"
            />
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground text-primary-foreground">
              <Camera className="size-5.5" strokeWidth={1.8} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-extrabold">غذا را اسکن کن</span>
              <span className="mt-0.5 block text-xs leading-5 text-foreground/90">
                از غذایت عکس بگیر تا کالری و مواد مغذی را تخمین بزنیم.
              </span>
            </span>
            <ChevronLeft
              className="size-5 shrink-0 text-foreground/60 transition-transform duration-300 group-hover:-translate-x-0.5"
              aria-hidden
            />
          </motion.button>

          {/* ── One insight, not ten cards ── */}
          {insight && (
            <motion.div
              variants={itemV}
              className="flex items-start gap-2.5 rounded-2xl bg-brand-soft/70 px-4 py-3.5"
            >
              <Sparkles className="mt-0.5 size-4 shrink-0 text-brand-strong" aria-hidden />
              <p className="text-[13px] leading-6 text-foreground/90">{insight}</p>
            </motion.div>
          )}

          {/* ── Engine warnings (rare) ── */}
          {targets.warnings.length > 0 && (
            <motion.p variants={itemV} className="text-xs leading-6 text-muted-foreground">
              {targets.warnings.map((w, i) => (
                <span key={i} className="block">
                  {enDigits(w)}
                </span>
              ))}
            </motion.p>
          )}

          {/* ── Advanced details ── */}
          <motion.div variants={itemV}>
            <CollapsibleDetails targets={targets} />
          </motion.div>
        </>
      )}
    </motion.div>
  )
}

/* ─────────────────────────── Today hero card ─────────────────────────── */

const MACRO_ROWS = [
  { key: 'proteinG', label: 'پروتئین', dot: 'bg-brand-soft', fill: 'bg-brand-soft' },
  { key: 'carbG', label: 'کربوهیدرات', dot: 'bg-energy', fill: 'bg-energy' },
  { key: 'fatG', label: 'چربی', dot: 'bg-white', fill: 'bg-white/85' },
  { key: 'fiberG', label: 'فیبر', dot: 'bg-brand-soft/60', fill: 'bg-brand-soft/60' },
] as const

function TodayCard({
  remaining,
  over,
  consumedPct,
  targets,
  consumed,
}: {
  remaining: number
  over: boolean
  consumedPct: number
  targets: ComputedTargetsData
  consumed: DailyTargets
}) {
  const reduced = useReducedMotion()
  const size = 184
  const sw = 11
  const r = (size - sw) / 2
  const p = Math.min(1, Math.max(0, consumedPct / 100))
  const tipX = size / 2 + r * Math.cos(2 * Math.PI * p)
  const tipY = size / 2 + r * Math.sin(2 * Math.PI * p)
  const showTip = p > 0.02
  const arcVisible = p >= 0.005
  const dotR = r - sw / 2 - 9
  const dotPeriod = (2 * Math.PI * dotR) / 64
  const shown = useCountUp(Math.abs(remaining))
  const draw = { duration: 1.1, ease: EASE, delay: 0.15 }

  return (
    <motion.section
      variants={itemV}
      aria-label="وضعیت امروز"
      className="relative overflow-hidden rounded-[28px] p-6 text-primary-foreground shadow-[0_24px_48px_-24px_rgba(9,38,52,0.55)]"
      style={{
        background: 'linear-gradient(155deg, var(--foreground) 0%, #0A3A52 58%, var(--primary) 100%)',
      }}
    >
      {/* ambient glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -start-14 -top-16 size-44 rounded-full bg-[radial-gradient(circle,rgba(255,110,66,0.20),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -end-12 size-56 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.08),transparent_70%)]"
      />

      <div className="relative flex items-center justify-between">
        <p className="text-[11px] font-bold tracking-wide text-white/60">بودجه امروز</p>
        <span
          className="tnum rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white/85"
          aria-label={`مصرف ${consumedPct.toFixed(0)} درصد از هدف`}
        >
          {enDigits(consumedPct.toFixed(0))}٪
        </span>
      </div>

      {/* ring + count */}
      <div className="relative mt-4 flex justify-center">
        <motion.div
          initial={reduced ? false : { scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
          className="relative inline-flex items-center justify-center"
          style={{ width: size, height: size }}
          role="img"
          aria-label={`${over ? 'کالری اضافه' : 'کالری باقی‌مانده'} ${fmt(Math.abs(remaining))}`}
        >
          {/* warm aura behind the whole ring */}
          <div
            aria-hidden
            className="absolute -inset-5 rounded-full"
            style={{
              background: over
                ? 'radial-gradient(circle, rgba(255,255,255,0.10), transparent 62%)'
                : 'radial-gradient(circle, rgba(255,110,66,0.15), transparent 62%)',
            }}
          />

          <svg width={size} height={size} className="-rotate-90" aria-hidden>
            <defs>
              <linearGradient id="fitaRing" x1="0.12" y1="0.95" x2="0.88" y2="0.05">
                <stop offset="0%" stopColor="var(--energy)" />
                <stop offset="55%" stopColor="#FF8E68" />
                <stop offset="100%" stopColor="#FFD6C4" />
              </linearGradient>
              <linearGradient id="fitaTrack" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,0.17)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0.06)" />
              </linearGradient>
              <radialGradient id="fitaTipHalo">
                <stop offset="0%" stopColor="rgba(255,158,122,0.60)" />
                <stop offset="45%" stopColor="rgba(255,140,100,0.26)" />
                <stop offset="100%" stopColor="rgba(255,140,100,0)" />
              </radialGradient>
              <radialGradient id="fitaTipHaloOver">
                <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
                <stop offset="45%" stopColor="rgba(255,255,255,0.22)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0)" />
              </radialGradient>
              <filter id="fitaRingGlow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="6" />
              </filter>
            </defs>

            {/* fine dotted inner ring — instrument texture */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={dotR}
              fill="none"
              stroke="rgba(255,255,255,0.11)"
              strokeWidth={1.4}
              strokeLinecap="round"
              strokeDasharray={`0.4 ${dotPeriod - 0.4}`}
            />

            {/* track — vertical gradient for quiet depth */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="url(#fitaTrack)"
              strokeWidth={sw}
            />

            {/* ambient glow under the arc */}
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={over ? 'rgba(255,255,255,0.7)' : 'url(#fitaRing)'}
              strokeWidth={sw + 7}
              strokeLinecap="round"
              filter="url(#fitaRingGlow)"
              initial={reduced ? false : { pathLength: 0, opacity: 0 }}
              animate={{
                pathLength: arcVisible ? p : 0,
                opacity: arcVisible ? (over ? 0.32 : 0.5) : 0,
              }}
              transition={reduced ? { duration: 0 } : draw}
            />

            {/* crisp arc */}
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={over ? 'rgba(255,255,255,0.96)' : 'url(#fitaRing)'}
              strokeWidth={sw}
              strokeLinecap="round"
              initial={reduced ? false : { pathLength: 0, opacity: 0 }}
              animate={{ pathLength: arcVisible ? p : 0, opacity: arcVisible ? 1 : 0 }}
              transition={reduced ? { duration: 0 } : draw}
            />

            {/* glowing tip — halo + core, rides the arc end */}
            <motion.circle
              r={13}
              fill={over ? 'url(#fitaTipHaloOver)' : 'url(#fitaTipHalo)'}
              initial={reduced ? false : { cx: size / 2 + r, cy: size / 2, opacity: 0 }}
              animate={{ cx: tipX, cy: tipY, opacity: showTip ? 1 : 0 }}
              transition={
                reduced
                  ? { duration: 0 }
                  : {
                      cx: draw,
                      cy: draw,
                      opacity: { duration: 0.35, delay: 0.95 },
                    }
              }
            />
            <motion.circle
              r={4}
              fill="#FFFFFF"
              initial={reduced ? false : { cx: size / 2 + r, cy: size / 2, opacity: 0 }}
              animate={{ cx: tipX, cy: tipY, opacity: showTip ? 1 : 0 }}
              transition={
                reduced
                  ? { duration: 0 }
                  : {
                      cx: draw,
                      cy: draw,
                      opacity: { duration: 0.35, delay: 0.95 },
                    }
              }
            />
          </svg>

          {/* soft lift behind the number */}
          <div
            aria-hidden
            className="absolute inset-[18px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.08),transparent_70%)]"
          />

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.p
              key={remaining}
              initial={{ opacity: 0.4 }}
              animate={{ opacity: 1 }}
              className="tnum text-[42px] font-extrabold leading-none tracking-tight text-white"
            >
              {fmt(shown)}
            </motion.p>
            <p className="mt-2 text-xs text-white/70">{over ? 'کالری اضافه' : 'کالری باقی‌مانده'}</p>
          </div>
        </motion.div>
      </div>

      <p className="tnum relative mt-4 text-center text-[13px] text-white/75">
        از <span className="font-bold text-white">{fmt(targets.kcal)}</span> کالری هدف ·{' '}
        <span className="font-bold text-white">{fmt(consumed.kcal)}</span> مصرف شده
      </p>

      {/* macros — color-coded dots, white ink (all ≥7:1 on navy) */}
      <div className="relative mt-5 grid grid-cols-4 gap-3 border-t border-white/10 pt-5">
        {MACRO_ROWS.map((m, i) => {
          const value = consumed[m.key]
          const target = targets[m.key]
          const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0
          return (
            <div key={m.key}>
              <p className="flex items-center gap-1.5 text-[10.5px] leading-4 text-white/65">
                <span className={cn('size-1.5 shrink-0 rounded-full', m.dot)} aria-hidden />
                {m.label}
              </p>
              <p className="tnum mt-1 text-[12.5px] font-bold leading-4">
                {fmt(value)}
                <span className="font-normal text-white/55"> / {fmt(target)}گ</span>
              </p>
              <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-white/15">
                <motion.div
                  className={cn('h-full rounded-full', m.fill)}
                  initial={reduced ? false : { width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.9, ease: EASE, delay: 0.3 + i * 0.06 }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </motion.section>
  )
}

/* ─────────────────────────── Water card ─────────────────────────── */

function WaterCard({ waterMl, busy, onAdd }: { waterMl: number; busy: boolean; onAdd: () => void }) {
  const shown = useCountUp(waterMl, 700)
  const pct = Math.min(100, (waterMl / WATER_TARGET_ML) * 100)
  const glasses = Math.round(waterMl / GLASS_ML)

  return (
    <div className="flex h-full flex-col rounded-3xl border border-border/60 bg-card p-4">
      <div className="flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft">
          <Droplets className="size-4 text-brand-strong" strokeWidth={1.8} aria-hidden />
        </span>
        <p className="text-[13px] font-bold">آب</p>
      </div>

      <p className="tnum mt-3 text-xl font-extrabold leading-none tracking-tight">
        {fmt(shown)}
        <span className="ms-1 text-[11px] font-medium text-muted-foreground">میلی‌لیتر</span>
      </p>

      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={WATER_TARGET_ML}
        aria-valuenow={waterMl}
        aria-label="آب امروز"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="tnum mt-1.5 text-[11px] text-muted-foreground">
        {enDigits(glasses)} از 8 لیوان
      </p>

      <Button
        type="button"
        size="sm"
        onClick={onAdd}
        disabled={busy}
        className="mt-auto h-9 w-full cursor-pointer rounded-full bg-primary text-xs font-bold text-primary-foreground hover:bg-primary/90"
      >
        <Plus className="size-4" strokeWidth={2.2} aria-hidden />
        یک لیوان
      </Button>
    </div>
  )
}

/* ─────────────────────────── Next meal card ─────────────────────────── */

function NextMealCard({
  item,
  onGoPlan,
}: {
  item: MealPlanData['days'][number]['items'][number] | null
  onGoPlan: () => void
}) {
  return (
    <button
      type="button"
      onClick={onGoPlan}
      className="flex h-full cursor-pointer flex-col rounded-3xl border border-border/60 bg-card p-4 text-start transition-colors hover:border-primary/30"
      aria-label={item ? 'مشاهده برنامه وعده بعدی' : 'ساخت برنامه غذایی'}
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-muted-foreground">وعده بعدی</p>
        <ChevronLeft className="size-4 text-muted-foreground" aria-hidden />
      </div>

      {item ? (
        <>
          <span className="mt-3 w-fit rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold text-brand-strong">
            {MEAL_LABEL[item.mealType as keyof typeof MEAL_LABEL] ?? item.mealType}
          </span>
          <p className="mt-1.5 line-clamp-2 text-sm font-bold leading-6">{item.titleFa}</p>
          {item.servingLabel && (
            <p className="tnum mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{item.servingLabel}</p>
          )}
          <p className="tnum mt-auto pt-2 text-lg font-extrabold leading-none tracking-tight">
            {enDigits(item.kcal)}
            <span className="ms-1 text-[10px] font-medium text-muted-foreground">kcal</span>
          </p>
        </>
      ) : (
        <div className="mt-3 flex flex-1 flex-col items-start justify-center gap-2">
          <Sparkles className="size-5 text-energy-strong" aria-hidden />
          <p className="text-[13px] font-bold leading-5">هنوز برنامه‌ای نساختی</p>
          <p className="text-[11px] leading-4 text-muted-foreground">
            بگذار فیتا برایت صبحانه، ناهار و شام بچیند.
          </p>
        </div>
      )}
    </button>
  )
}

/* ─────────────────────────── Shared pieces ─────────────────────────── */

function CollapsibleDetails({ targets }: { targets: ComputedTargetsData }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-1.5 px-0.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <Info className="size-3.5" aria-hidden />
        جزئیات محاسبه
        <svg
          viewBox="0 0 24 24"
          className={cn('size-3.5 transition-transform', open && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <dl className="tnum mt-3 divide-y divide-border/60 text-sm">
          <DetailRow label="متابولیسم پایه (BMR)" value={`${fmt(targets.bmr)} کالری`} />
          <DetailRow label="سوخت‌وساز روزانه (TDEE)" value={`${fmt(targets.tdee)} کالری`} />
          <DetailRow label="شاخص توده بدنی (BMI)" value={enDigits(targets.bmi.toLocaleString('en-US'))} />
          <DetailRow label="روش محاسبه" value="میفلین-سنت‌جور" />
        </dl>
      )}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}

function HomeSkeleton() {
  return (
    <div className="space-y-6 pt-1">
      <SkeletonBlock className="h-[380px] w-full rounded-[28px]" />
      <div className="grid grid-cols-2 gap-3">
        <SkeletonBlock className="h-40 rounded-3xl" />
        <SkeletonBlock className="h-40 rounded-3xl" />
      </div>
      <SkeletonBlock className="h-24 w-full rounded-3xl" />
    </div>
  )
}

function trialCountdown(iso: string | null): string | null {
  if (!iso) return null
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
  if (Number.isNaN(days) || days < 0) return null
  return days === 0 ? 'امروز آخرین روز دوره آزمایشی است' : `${enDigits(days)} روز`
}

const REMINDER_ICON = {
  MEAL: UtensilsCrossed,
  WATER: Droplets,
  WEIGHT: LineChart,
  STREAK: Flame,
  PLAN: CalendarDays,
} as const

const REMINDER_ACTION_LABEL: Record<ReminderAction, string> = {
  LOG_FOOD: 'ثبت غذا',
  LOG_WATER: 'ثبت آب',
  LOG_WEIGHT: 'ثبت وزن',
  OPEN_PLAN: 'دیدن برنامه',
}

function ReminderRow({
  reminder,
  onAction,
}: {
  reminder: ReminderDto
  onAction: (action: ReminderAction) => void
}) {
  const Icon = REMINDER_ICON[reminder.type] ?? Bell
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft">
        <Icon className="size-4 text-brand-strong" strokeWidth={1.8} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold leading-5">{reminder.titleFa}</p>
        <p className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-muted-foreground">
          {reminder.bodyFa}
        </p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="h-8 shrink-0 rounded-full px-3.5 text-xs font-bold"
        onClick={() => onAction(reminder.action)}
      >
        {REMINDER_ACTION_LABEL[reminder.action]}
      </Button>
    </div>
  )
}
