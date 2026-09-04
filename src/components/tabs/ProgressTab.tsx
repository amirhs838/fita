'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Flame, Loader2, Minus, Plus, TrendingDown, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ErrorState } from '@/components/fita/States'
import { api } from '@/lib/client'
import { enDigits } from '@/lib/phone'
import { cn } from '@/lib/utils'
import { toastAwards } from '@/lib/awards-toast'
import type {
  AchievementsData,
  LeaderboardData,
  ProgressData,
  WeightData,
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

/** Custom light SVG line chart — monochrome, RTL-safe axis order. Tone via className (currentColor). */
function WeightChart({ records, targetKg, className }: { records: { date: string; weightKg: number }[]; targetKg: number | null; className?: string }) {
  const W = 320
  const H = 130
  const PAD = 10

  const points = records.slice(-30)
  if (points.length < 2) {
    return (
      <p className="py-8 text-center text-xs text-muted-foreground">
        برای رسم روند، حداقل دو بار وزن ثبت کن.
      </p>
    )
  }

  const values = points.map((p) => p.weightKg)
  if (targetKg) values.push(targetKg)
  const min = Math.min(...values) - 1
  const max = Math.max(...values) + 1
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / (points.length - 1)
  const y = (v: number) => PAD + ((max - v) * (H - PAD * 2)) / (max - min || 1)

  const line = points.map((p, i) => `${x(i)},${y(p.weightKg)}`).join(' ')
  const area = `${PAD},${H - PAD} ${line} ${W - PAD},${H - PAD}`
  const last = points.at(-1)!

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn('w-full', className)} role="img" aria-label="نمودار وزن">
      <defs>
        <linearGradient id="wt-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.1" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {targetKg !== null && (
        <g>
          <line
            x1={PAD}
            y1={y(targetKg)}
            x2={W - PAD}
            y2={y(targetKg)}
            strokeDasharray="3 5"
            stroke="currentColor"
            strokeOpacity="0.3"
            strokeWidth="1"
          />
          <text x={W - PAD} y={y(targetKg) - 4} textAnchor="end" fontSize="8" fill="currentColor" fillOpacity="0.45">
            هدف {fmtNum(targetKg)}
          </text>
        </g>
      )}
      <polygon points={area} fill="url(#wt-grad)" />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle
          key={p.date}
          cx={x(i)}
          cy={y(p.weightKg)}
          r={i === points.length - 1 ? 3.5 : 1.75}
          fill="currentColor"
          stroke="var(--background)"
          strokeWidth={i === points.length - 1 ? 1.5 : 0}
        />
      ))}
      <text x={PAD} y={H - 1} fontSize="8" fill="currentColor" fillOpacity="0.45">
        {shortFaDate(points[0].date)}
      </text>
      <text x={W - PAD} y={H - 1} textAnchor="end" fontSize="8" fill="currentColor" fillOpacity="0.45">
        {shortFaDate(last.date)}
      </text>
    </svg>
  )
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

  useEffect(() => {
    void load()
  }, [load])

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
      await load()
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
        <div className="h-40 w-full animate-pulse rounded-2xl bg-muted" />
        <div className="h-20 w-full animate-pulse rounded-2xl bg-muted/70" />
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
      {/* ── Weight journey — hero ── */}
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
              <span className="tnum flex items-center gap-1 pb-1 text-xs font-bold text-energy">
                {losing ? <TrendingDown className="size-3.5" aria-hidden /> : <TrendingUp className="size-3.5" aria-hidden />}
                {losing ? '' : '+'}
                {fmtNum(weight.changeKg)}
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

          <div className="mt-4">
            <WeightChart records={weight?.records ?? []} targetKg={weight?.targetKg ?? null} className="text-white" />
          </div>
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
