'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Flame,
  Loader2,
  Minus,
  Percent,
  Plus,
  Ruler,
  Scale,
  TrendingDown,
  TrendingUp,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { TrendChart } from '@/components/charts/TrendChart'
import { ErrorState } from '@/components/fita/States'
import { api } from '@/lib/client'
import { enDigits } from '@/lib/phone'
import { cn } from '@/lib/utils'
import { toastAwards } from '@/lib/awards-toast'
import type {
  AchievementsData,
  LeaderboardData,
  ProgressData,
  TrendMetric,
  TrendRange,
  TrendsData,
} from '@/lib/types'

function fmtInt(n: number): string {
  return enDigits(Math.round(n).toLocaleString('en-US'))
}

function fmtNum(n: number): string {
  return enDigits(String(Math.round(n * 10) / 10))
}

function shortFaDate(date: string): string {
  const d = new Date(`${date}T12:00:00`)
  try {
    return new Intl.DateTimeFormat('fa-IR-u-nu-latn', { day: 'numeric', month: 'short' }).format(d)
  } catch {
    return ''
  }
}

function monthFaDate(date: string): string {
  const d = new Date(`${date}T12:00:00`)
  try {
    return new Intl.DateTimeFormat('fa-IR-u-nu-latn', { month: 'short' }).format(d)
  } catch {
    return ''
  }
}

const METRICS: {
  key: TrendMetric
  label: string
  unit: string
  tone: 'brand' | 'ink' | 'energy'
  icon: LucideIcon
  caption: string
}[] = [
  { key: 'weight', label: 'وزن', unit: 'کیلوگرم', tone: 'brand', icon: Scale, caption: 'وزن فعلی' },
  { key: 'bodyFat', label: 'چربی بدن', unit: 'درصد', tone: 'ink', icon: Percent, caption: 'آخرین تخمین چربی' },
  { key: 'calories', label: 'کالری', unit: 'کالری', tone: 'energy', icon: Flame, caption: 'میانگین روز ثبت‌شده' },
]

const RANGES: { key: TrendRange; label: string }[] = [
  { key: '1w', label: 'هفته' },
  { key: '1m', label: 'ماه' },
  { key: '3m', label: '3 ماه' },
  { key: '6m', label: '6 ماه' },
  { key: '1y', label: 'سال' },
]

const EMPTY_HINTS: Record<TrendMetric, { icon: LucideIcon; text: string }> = {
  weight: { icon: Scale, text: 'برای رسم روند وزن، حداقل در دو روز مختلف وزن ثبت کن.' },
  bodyFat: { icon: Ruler, text: 'برای تخمین چربی بدن، دور کمر و گردن را در پروفایل ثبت کن.' },
  calories: { icon: UtensilsCrossed, text: 'در این بازه غذایی ثبت نشده — از دیاری شروع کن.' },
}

type DeltaTone = 'good' | 'off' | 'neutral'

const CHIP_TONE: Record<DeltaTone, string> = {
  good: 'bg-positive/10 text-positive',
  off: 'bg-energy-soft text-energy-strong',
  neutral: 'bg-muted text-muted-foreground',
}

export function ProgressTab() {
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [achievements, setAchievements] = useState<AchievementsData | null>(null)
  const [board, setBoard] = useState<LeaderboardData | null>(null)
  const [boardPeriod, setBoardPeriod] = useState<'weekly' | 'monthly'>('weekly')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [weightInput, setWeightInput] = useState('')
  const [saving, setSaving] = useState(false)

  // ── Trends (charts) ──
  const [metric, setMetric] = useState<TrendMetric>('weight')
  const [range, setRange] = useState<TrendRange>('1m')
  const [trendsByRange, setTrendsByRange] = useState<Partial<Record<TrendRange, TrendsData>>>({})
  const [trendsLoading, setTrendsLoading] = useState(true)
  const [trendsError, setTrendsError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const [p, a, l] = await Promise.all([
        api<ProgressData>('/api/progress'),
        api<AchievementsData>('/api/achievements'),
        api<LeaderboardData>('/api/leaderboard?period=weekly'),
      ])
      setProgress(p)
      setAchievements(a)
      setBoard(l)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadTrends = useCallback(async (r: TrendRange) => {
    setTrendsLoading(true)
    setTrendsError(false)
    try {
      const data = await api<TrendsData>(`/api/progress/trends?range=${r}`)
      setTrendsByRange((prev) => ({ ...prev, [r]: data }))
    } catch {
      setTrendsError(true)
    } finally {
      setTrendsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadTrends(range)
  }, [range, loadTrends])

  const trends = trendsByRange[range]
  const metricInfo = METRICS.find((m) => m.key === metric) ?? METRICS[0]

  const metricPoints = useMemo(() => {
    if (!trends) return []
    if (metric === 'weight') return trends.weight.points
    if (metric === 'bodyFat') return trends.bodyFat.points
    return trends.calories.points
  }, [trends, metric])

  const bigValue = useMemo(() => {
    if (!trends) return null
    if (metric === 'calories') {
      return trends.calories.avgKcal != null ? fmtInt(trends.calories.avgKcal) : null
    }
    const pts = metric === 'weight' ? trends.weight.points : trends.bodyFat.points
    if (metric === 'weight' && pts.length === 0 && trends.weight.currentKg != null) {
      return fmtNum(trends.weight.currentKg)
    }
    if (pts.length === 0) return null
    return fmtNum(pts[pts.length - 1].value)
  }, [trends, metric])

  const delta = useMemo<{ tone: DeltaTone; dir: 'up' | 'down' | 'flat'; num: string; suffix?: string } | null>(() => {
    if (!trends) return null
    if (metric === 'calories') {
      const avg = trends.calories.avgKcal
      const t = trends.calories.targetKcal
      if (avg == null) return null
      if (t == null || t === 0) return { tone: 'neutral', dir: 'flat', num: fmtInt(avg), suffix: 'میانگین بازه' }
      const d = Math.round(avg - t)
      const sign = d < 0 ? '−' : '+'
      const tone: DeltaTone = Math.abs(d) <= t * 0.075 ? 'good' : 'neutral'
      return { tone, dir: d < 0 ? 'down' : 'up', num: `${sign}${fmtInt(Math.abs(d))}`, suffix: 'نسبت به هدف' }
    }
    const pts = metric === 'weight' ? trends.weight.points : trends.bodyFat.points
    if (pts.length < 2) return null
    const d = Math.round((pts[pts.length - 1].value - pts[0].value) * 10) / 10
    if (d === 0) return { tone: 'neutral', dir: 'flat', num: fmtNum(0) }
    const dir = d < 0 ? 'down' : 'up'
    let tone: DeltaTone = 'neutral'
    if (metric === 'bodyFat') {
      tone = d < 0 ? 'good' : 'off'
    } else if (trends.goalType === 'GAIN_WEIGHT' || trends.goalType === 'BUILD_MUSCLE') {
      tone = d < 0 ? 'off' : 'good'
    } else if (trends.goalType === 'LOSE_WEIGHT' || trends.goalType === 'RECOMP') {
      tone = d < 0 ? 'good' : 'off'
    }
    return { tone, dir, num: fmtNum(Math.abs(d)) }
  }, [trends, metric])

  const chartTarget = useMemo(() => {
    if (!trends) return null
    if (metric === 'weight') return trends.weight.targetKg
    if (metric === 'calories') return trends.calories.targetKcal
    return null
  }, [trends, metric])

  const formatDate = useMemo(() => {
    if (trends?.bucket === 'month') return monthFaDate
    return shortFaDate
  }, [trends])

  const microStats = useMemo<{ label: string; value: string }[]>(() => {
    if (!trends) return []
    if (metric === 'calories') {
      return [
        { label: 'میانگین', value: trends.calories.avgKcal != null ? fmtInt(trends.calories.avgKcal) : '—' },
        { label: 'هدف', value: trends.calories.targetKcal != null ? fmtInt(trends.calories.targetKcal) : '—' },
        { label: 'روز ثبت‌شده', value: enDigits(trends.calories.loggedDays) },
      ]
    }
    const pts = metric === 'weight' ? trends.weight.points : trends.bodyFat.points
    if (pts.length === 0) return []
    const vals = pts.map((p) => p.value)
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length
    return [
      { label: 'کمترین', value: fmtNum(Math.min(...vals)) },
      { label: 'بیشترین', value: fmtNum(Math.max(...vals)) },
      { label: 'میانگین', value: fmtNum(avg) },
    ]
  }, [trends, metric])

  const chartEmpty = useMemo(() => {
    if (metric === 'calories') return metricPoints.length === 0
    return metricPoints.length < 2
  }, [metric, metricPoints])

  async function loadBoard(period: 'weekly' | 'monthly') {
    setBoardPeriod(period)
    try {
      const data = await api<LeaderboardData>(`/api/leaderboard?period=${period}`)
      setBoard(data)
    } catch {
      toast.error('جدول امتیاز بارگذاری نشد.')
    }
  }

  async function saveWeight() {
    const value = Number(weightInput.replace(/[^\d.]/g, ''))
    if (!Number.isFinite(value) || value < 35 || value > 250) {
      toast.error('وزن را بین 35 تا 250 کیلوگرم وارد کن.')
      return
    }
    setSaving(true)
    try {
      const data = await api<{ record: { date: string; weightKg: number }; awards: never[] }>('/api/weight', {
        method: 'POST',
        body: JSON.stringify({ weightKg: value }),
      })
      toastAwards(data.awards)
      toast.success('وزن امروز ثبت شد')
      setSheetOpen(false)
      setWeightInput('')
      await Promise.all([load(), loadTrends(range)])
    } catch {
      toast.error('ثبت وزن انجام نشد.')
    } finally {
      setSaving(false)
    }
  }

  const stats = progress?.stats
  const weight = progress?.weight
  const loggedDays = progress?.consistency.days.filter((d) => d.logged).length ?? 0
  const unlocked = useMemo(() => achievements?.achievements.filter((a) => a.unlocked) ?? [], [achievements])

  if (loading) {
    return (
      <div className="space-y-8 pt-2">
        <div className="h-32 w-full animate-pulse rounded-2xl bg-muted" />
        <div className="h-72 w-full animate-pulse rounded-2xl bg-muted/70" />
        <div className="h-32 w-full animate-pulse rounded-2xl bg-muted/50" />
      </div>
    )
  }

  if (error) {
    return <ErrorState title="پیشرفت بارگذاری نشد" onRetry={() => void load()} />
  }

  const losing = (weight?.changeKg ?? 0) < 0

  return (
    <div className="space-y-8">
      {/* ── Weight — compact hero ── */}
      <section aria-label="وزن" className="pt-1">
        <div className="flex items-center justify-between px-0.5">
          <h1 className="eyebrow">پیشرفت من</h1>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex cursor-pointer items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Plus className="size-3.5" aria-hidden />
            ثبت وزن
          </button>
        </div>

        <div className="mt-3 rounded-3xl bg-foreground px-5 py-5 text-white shadow-[0_10px_28px_-14px_oklch(0.25_0.05_230)]">
          <div className="flex items-end justify-between gap-4">
            <p className="tnum text-[40px] font-bold leading-none tracking-tight text-white">
              {weight?.currentKg != null ? fmtNum(weight.currentKg) : '—'}
              <span className="ms-1.5 text-sm font-normal text-white/60">کیلوگرم</span>
            </p>
            {weight?.changeKg != null && weight.changeKg !== 0 && (
              <span className="flex items-center gap-1 pb-1 text-xs font-bold text-energy">
                {losing ? <TrendingDown className="size-3.5" aria-hidden /> : <TrendingUp className="size-3.5" aria-hidden />}
                <span dir="ltr" className="tnum">
                  {losing ? '−' : '+'}
                  {fmtNum(Math.abs(weight.changeKg))}
                </span>
              </span>
            )}
          </div>

          {weight?.targetKg != null && (
            <p className="tnum mt-1.5 text-[13px] text-white/65">
              هدف {fmtNum(weight.targetKg)} کیلوگرم
              {weight.currentKg != null && (
                <> · {fmtNum(Math.abs(weight.currentKg - weight.targetKg))} کیلوگرم تا هدف</>
              )}
            </p>
          )}
        </div>
      </section>

      {/* ── روندها — وزن / چربی بدن / کالری ── */}
      <section aria-label="روندها" className="space-y-3">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="eyebrow">روندها</h2>
          {trendsError && (
            <button
              type="button"
              onClick={() => void loadTrends(range)}
              className="cursor-pointer text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              تلاش دوباره
            </button>
          )}
        </div>

        <div className="rounded-3xl bg-card p-5 shadow-[0_1px_3px_oklch(0.175_0_0/0.05)]">
          {/* metric switcher */}
          <div className="flex rounded-full bg-muted p-1" role="tablist" aria-label="سنجه نمودار">
            {METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={metric === m.key}
                onClick={() => setMetric(m.key)}
                className={cn(
                  'relative flex-1 cursor-pointer rounded-full py-1.5 text-[13px] font-bold transition-colors',
                  metric === m.key ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {metric === m.key && (
                  <motion.span
                    layoutId="metric-pill"
                    className="absolute inset-0 rounded-full bg-primary"
                    transition={{ type: 'spring', stiffness: 500, damping: 42 }}
                  />
                )}
                <span className="relative">{m.label}</span>
              </button>
            ))}
          </div>

          {/* current value + delta */}
          <div className="mt-4 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="tnum text-[32px] font-bold leading-none tracking-tight">
                {bigValue ?? '—'}
                <span className="ms-1.5 text-xs font-normal text-muted-foreground">{metricInfo.unit}</span>
              </p>
              <p className="mt-1.5 text-[11px] text-muted-foreground">{metricInfo.caption}</p>
            </div>
            {delta && (
              <span
                className={cn(
                  'flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold',
                  CHIP_TONE[delta.tone],
                )}
              >
                {delta.dir === 'down' ? (
                  <TrendingDown className="size-3" aria-hidden />
                ) : delta.dir === 'up' ? (
                  <TrendingUp className="size-3" aria-hidden />
                ) : (
                  <Minus className="size-3" aria-hidden />
                )}
                <span dir="ltr" className="tnum">{delta.num}</span>
                {delta.suffix && <span>{delta.suffix}</span>}
              </span>
            )}
          </div>

          {/* range selector */}
          <div className="mt-4 flex rounded-full bg-muted p-0.5" role="tablist" aria-label="بازه زمانی">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                role="tab"
                aria-selected={range === r.key}
                onClick={() => setRange(r.key)}
                className={cn(
                  'relative flex-1 cursor-pointer rounded-full py-1 text-[11px] font-bold transition-colors',
                  range === r.key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {range === r.key && (
                  <motion.span
                    layoutId="range-pill"
                    className="absolute inset-0 rounded-full bg-background shadow-sm"
                    transition={{ type: 'spring', stiffness: 500, damping: 42 }}
                  />
                )}
                <span className="relative">{r.label}</span>
              </button>
            ))}
          </div>

          {/* chart body */}
          <div className="mt-3 min-h-[176px]">
            {trendsLoading && !trends ? (
              <div className="flex min-h-[176px] items-center">
                <div className="h-36 w-full animate-pulse rounded-2xl bg-muted/60" />
              </div>
            ) : trendsError && !trends ? (
              <div className="flex min-h-[176px] flex-col items-center justify-center gap-3 text-center">
                <p className="text-xs text-muted-foreground">نمودارها بارگذاری نشد.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-full px-4 text-xs"
                  onClick={() => void loadTrends(range)}
                >
                  تلاش دوباره
                </Button>
              </div>
            ) : trends && chartEmpty ? (
              (() => {
                const hint = EMPTY_HINTS[metric]
                return (
                  <div className="flex min-h-[176px] flex-col items-center justify-center gap-2.5 text-center">
                    <span className="flex size-10 items-center justify-center rounded-full bg-surface-alt text-muted-foreground">
                      <hint.icon className="size-4.5" aria-hidden />
                    </span>
                    <p className="max-w-[250px] text-xs leading-5 text-muted-foreground">{hint.text}</p>
                  </div>
                )
              })()
            ) : trends && metricPoints.length >= (metric === 'calories' ? 1 : 2) ? (
              <TrendChart
                key={`${metric}-${range}`}
                points={metricPoints}
                mode={metric === 'calories' ? 'bar' : 'line'}
                tone={metricInfo.tone}
                target={chartTarget}
                targetLabel="هدف"
                unit={metricInfo.unit}
                formatValue={metric === 'calories' ? fmtInt : fmtNum}
                formatDate={formatDate}
                ariaLabel={`نمودار ${metricInfo.label} در ${RANGES.find((r) => r.key === range)?.label ?? ''} اخیر`}
              />
            ) : null}
          </div>

          {/* period micro-stats */}
          {microStats.length > 0 && !chartEmpty && (
            <div className="mt-2 grid grid-cols-3 gap-2">
              {microStats.map((s) => (
                <div key={s.label} className="rounded-2xl bg-surface-alt px-1 py-2.5 text-center">
                  <p className="tnum truncate text-sm font-bold">{s.value}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Consistency ── */}
      <section aria-label="پیوستگی" className="space-y-3">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="eyebrow">پیوستگی</h2>
          <span className="tnum flex items-center gap-1 rounded-full bg-energy-soft px-3 py-1 text-xs font-bold text-foreground">
            <Flame className="size-3.5 text-energy-strong" aria-hidden />
            {enDigits(stats?.currentStreak ?? 0)} روز پیوسته
          </span>
        </div>

        <div className="flex items-center gap-1.5" role="img" aria-label={`${loggedDays} روز از 7 روز ثبت شده`}>
          {progress?.consistency.days.map((d) => (
            <span
              key={d.date}
              title={shortFaDate(d.date)}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors duration-300',
                d.logged ? 'bg-primary' : 'bg-muted',
              )}
            />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {enDigits(loggedDays)} از 7 روز اخیر ثبت غذا داشتی
        </p>

        <div>
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-bold">سطح {enDigits(stats?.level ?? 1)}</span>
            <span className="tnum text-muted-foreground">
              {enDigits(stats?.xpToNextLevel ?? 200)} امتیاز تا سطح بعد
            </span>
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
              style={{
                width: `${Math.min(100, 100 - ((stats?.xpToNextLevel ?? 200) / 200) * 100)}%`,
              }}
              role="progressbar"
              aria-valuenow={stats?.level ?? 1}
              aria-valuemin={1}
            />
          </div>
        </div>
      </section>

      {/* ── Achievements — elegant, monochrome ── */}
      <section aria-label="نشان‌ها">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="eyebrow">نشان‌ها</h2>
          <span className="tnum text-xs text-muted-foreground">
            {enDigits(unlocked.length)} از {enDigits(achievements?.achievements.length ?? 0)}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {achievements?.achievements.map((a) => (
            <div
              key={a.code}
              className={cn(
                'flex flex-col items-center rounded-2xl bg-card px-1 py-3 text-center',
                'shadow-[0_1px_2px_oklch(0.175_0_0/0.04)]',
                !a.unlocked && 'opacity-35 grayscale',
              )}
              title={a.descriptionFa}
            >
              <span
                className={cn(
                  'flex size-9 items-center justify-center rounded-full text-base',
                  a.unlocked ? 'bg-brand-soft' : 'bg-muted',
                )}
                aria-hidden
              >
                {a.icon ?? '🏅'}
              </span>
              <span className="mt-1.5 text-[9px] font-bold leading-3">{a.titleFa}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Leaderboard — premium ranking ── */}
      <section aria-label="جدول امتیاز">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="eyebrow">جدول امتیاز</h2>
          <div className="flex rounded-full bg-muted p-0.5">
            {(['weekly', 'monthly'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => void loadBoard(p)}
                className={cn(
                  'cursor-pointer rounded-full px-3 py-1 text-[11px] font-bold transition-all',
                  boardPeriod === p ? 'bg-background shadow-sm' : 'text-muted-foreground',
                )}
                aria-pressed={boardPeriod === p}
              >
                {p === 'weekly' ? 'هفتگی' : 'ماهانه'}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 px-0.5 text-[11px] text-muted-foreground">
          امتیاز فقط بر اساس رفتار سالم — نه وزن بدن
        </p>

        {board && board.entries.length > 0 ? (
          <ol className="mt-2 divide-y divide-border/60">
            {board.entries.slice(0, 5).map((e) => (
              <li
                key={e.userId}
                className={cn(
                  'flex items-center gap-3 py-2.5 text-sm',
                  e.isMe && 'font-bold',
                )}
              >
                <span className="tnum w-6 text-center text-xs font-bold text-muted-foreground">
                  {enDigits(e.rank)}
                </span>
                <span className="flex size-7 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                  {e.name?.trim()[0] ?? '؟'}
                </span>
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                <span className="tnum text-xs text-muted-foreground">{fmtInt(e.score)} امتیاز</span>
              </li>
            ))}
            {board.myRank != null && board.myRank > 5 && (
              <li className="flex items-center gap-3 rounded-2xl bg-muted/60 px-2 py-2.5 text-sm font-bold">
                <span className="tnum w-6 text-center text-xs font-bold text-muted-foreground">
                  {enDigits(board.myRank)}
                </span>
                <span className="flex size-7 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                  تو
                </span>
                <span className="min-w-0 flex-1 truncate">خودت</span>
                <span className="tnum text-xs">{fmtInt(board.myScore)} امتیاز</span>
              </li>
            )}
          </ol>
        ) : (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            هنوز کسی امتیاز نگرفته — اولین باش!
          </p>
        )}
      </section>

      {/* Add weight sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-[28px] px-6 pb-8 pt-3 sm:max-w-md sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2">
          <SheetHeader className="px-1 text-start">
            <SheetTitle className="text-lg font-bold">ثبت وزن</SheetTitle>
            <SheetDescription className="text-[13px]">وزن امروزت را وارد کن (کیلوگرم)</SheetDescription>
          </SheetHeader>
          <div className="mt-5 flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="size-12 shrink-0 rounded-full"
              aria-label="کمتر"
              onClick={() =>
                setWeightInput((v) => {
                  const n = Number(v || '0')
                  return Number.isFinite(n) && n > 35 ? String(Math.round((n - 0.5) * 2) / 2) : v
                })
              }
            >
              <Minus className="size-4" aria-hidden />
            </Button>
            <Input
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              inputMode="decimal"
              placeholder={weight?.currentKg != null ? String(weight.currentKg) : 'مثلاً 74'}
              aria-label="وزن به کیلوگرم"
              className="tnum h-14 rounded-2xl border-border/80 text-center text-2xl font-bold"
            />
            <Button
              variant="outline"
              size="icon"
              className="size-12 shrink-0 rounded-full"
              aria-label="بیشتر"
              onClick={() =>
                setWeightInput((v) => {
                  const n = Number(v || '0')
                  return Number.isFinite(n) && n < 250 ? String(Math.round((n + 0.5) * 2) / 2) : v
                })
              }
            >
              <Plus className="size-4" aria-hidden />
            </Button>
          </div>
          <Button
            onClick={() => void saveWeight()}
            disabled={saving || !weightInput}
            className="mt-5 h-12 w-full rounded-full text-base font-bold"
          >
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
            ذخیره
          </Button>
          <p className="mt-3 text-center text-[11px] leading-5 text-muted-foreground">
            وزن هر روز فقط یک بار ثبت می‌شود؛ ثبت مجدد همان روز، مقدار را به‌روز می‌کند.
          </p>
        </SheetContent>
      </Sheet>
    </div>
  )
}
