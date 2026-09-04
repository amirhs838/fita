'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Coffee, Cookie, Loader2, MoonStar, RefreshCw, Sparkles, Sun } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/fita/States'
import { api } from '@/lib/client'
import { todayIso } from '@/lib/date'
import { enDigits } from '@/lib/phone'
import { BUDGET_LABEL, MEAL_LABEL } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { toastAwards } from '@/lib/awards-toast'
import type {
  AchievementDto,
  AdminBudgetLevel,
  MealPlanData,
  MealPlanResponse,
  MeData,
  PlanItemDto,
  RegenerateDayData,
  SwapItemData,
} from '@/lib/types'

const MEAL_ICON: Record<string, typeof Coffee> = {
  BREAKFAST: Coffee,
  LUNCH: Sun,
  SNACK: Cookie,
  DINNER: MoonStar,
}

const BUDGETS: AdminBudgetLevel[] = ['ECONOMY', 'MID', 'FLEXIBLE']

function fmtInt(n: number): string {
  return enDigits(Math.round(n).toLocaleString('en-US'))
}

/** Persian weekday from an ISO day key (Saturday = start of Iranian week). */
function weekdayFa(date: string): string {
  const d = new Date(`${date}T12:00:00`)
  const days = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه']
  return days[d.getDay()]
}

function dayNumFa(date: string): string {
  const d = new Date(`${date}T12:00:00`)
  try {
    return new Intl.DateTimeFormat('fa-IR-u-nu-latn', { day: 'numeric' }).format(d)
  } catch {
    return ''
  }
}

function monthFa(date: string): string {
  const d = new Date(`${date}T12:00:00`)
  try {
    return new Intl.DateTimeFormat('fa-IR-u-nu-latn', { month: 'long' }).format(d)
  } catch {
    return ''
  }
}

function normalizeBudget(v: string | null | undefined): AdminBudgetLevel | null {
  return v === 'ECONOMY' || v === 'MID' || v === 'FLEXIBLE' ? v : null
}

export function PlanTab() {
  const [plan, setPlan] = useState<MealPlanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [regenningDay, setRegenningDay] = useState(false)
  const [selectedDay, setSelectedDay] = useState(0)
  const [swappingId, setSwappingId] = useState<string | null>(null)
  /** budget the user picked for the selected day (null = inherit day/plan default) */
  const [dayBudgetSel, setDayBudgetSel] = useState<AdminBudgetLevel | null>(null)
  const [budget, setBudget] = useState<AdminBudgetLevel>('MID')

  const todayKey = todayIso()

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const [meData, data] = await Promise.all([
        api<MeData>('/api/me').catch(() => null),
        api<MealPlanResponse>('/api/meal-plan'),
      ])
      setPlan(data.plan)
      const b = data.plan?.budgetLevel ?? normalizeBudget(meData?.profile?.budgetLevel)
      if (b) setBudget(b)
      if (data.plan) {
        const idx = data.plan.days.findIndex((d) => d.date === todayKey)
        setSelectedDay(idx >= 0 ? idx : 0)
      }
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [todayKey])

  useEffect(() => {
    void load()
  }, [load])

  async function generate() {
    setGenerating(true)
    try {
      const data = await api<{ plan: MealPlanData; awards?: AchievementDto[] }>('/api/meal-plan/generate', {
        method: 'POST',
        body: JSON.stringify({ budgetLevel: budget }),
      })
      setPlan(data.plan)
      setDayBudgetSel(null)
      const idx = data.plan.days.findIndex((d) => d.date === todayKey)
      setSelectedDay(idx >= 0 ? idx : 0)
      toast.success(`برنامه هفتگی برای بودجه «${BUDGET_LABEL[budget].title}» ساخته شد`, {
        description: 'این برنامه فقط پیشنهاد است — هر وعده را می‌توانی عوض کنی.',
      })
      toastAwards(data.awards)
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'ساخت برنامه انجام نشد.')
    } finally {
      setGenerating(false)
    }
  }

  async function regenerateDay() {
    if (!plan) return
    const day = plan.days[selectedDay]
    if (!day || regenningDay) return
    const tier = dayBudgetSel ?? day.budgetLevel ?? plan.budgetLevel ?? 'MID'
    setRegenningDay(true)
    try {
      const data = await api<RegenerateDayData>('/api/meal-plan/regenerate-day', {
        method: 'POST',
        body: JSON.stringify({ date: day.date, budgetLevel: tier }),
      })
      setPlan(data.plan)
      setDayBudgetSel(null)
      toast.success(`پیشنهاد این روز با بودجه «${BUDGET_LABEL[tier].title}» تازه شد`, {
        description: 'اگر باز راضی نبودی، دوباره بزن.',
      })
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'چیدن این روز انجام نشد.')
    } finally {
      setRegenningDay(false)
    }
  }

  async function swapItem(item: PlanItemDto) {
    setSwappingId(item.id)
    try {
      const data = await api<SwapItemData>('/api/meal-plan/replace-item', {
        method: 'POST',
        body: JSON.stringify({ itemId: item.id }),
      })
      setPlan((prev) =>
        prev
          ? {
              ...prev,
              days: prev.days.map((d) => ({
                ...d,
                items: d.items.map((it) => (it.id === data.item.id ? data.item : it)),
              })),
            }
          : prev,
      )
      toast.success('پیشنهاد عوض شد', { description: `${data.item.titleFa} · ${enDigits(data.item.kcal)} کیلوکالری` })
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'جایگزینی انجام نشد.')
    } finally {
      setSwappingId(null)
    }
  }

  function selectDay(i: number) {
    setSelectedDay(i)
    setDayBudgetSel(null)
  }

  const day = plan?.days[selectedDay]

  const effectiveDayBudget: AdminBudgetLevel =
    dayBudgetSel ?? normalizeBudget(day?.budgetLevel) ?? normalizeBudget(plan?.budgetLevel) ?? 'MID'

  const grouped = useMemo(() => {
    if (!day) return []
    const order = ['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER']
    return order
      .map((meal) => ({ meal, items: day.items.filter((it) => it.mealType === meal) }))
      .filter((g) => g.items.length > 0)
  }, [day])

  const dayTotalKcal = day ? day.items.reduce((s, it) => s + it.kcal, 0) : 0

  const budgetChips = (
    <div
      role="radiogroup"
      aria-label="سطح بودجه کل هفته"
      className="grid grid-cols-3 gap-1 rounded-full bg-muted/70 p-1"
    >
      {BUDGETS.map((b) => {
        const active = budget === b
        return (
          <button
            key={b}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setBudget(b)}
            title={BUDGET_LABEL[b].hint}
            className={cn(
              'flex h-9 cursor-pointer items-center justify-center rounded-full text-[13px] font-medium transition-all duration-200',
              active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {BUDGET_LABEL[b].title}
          </button>
        )
      })}
    </div>
  )

  const needsRegen = plan !== null && plan.budgetLevel !== budget

  if (loading) {
    return (
      <div className="space-y-8 pt-2">
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted/70" />
        ))}
      </div>
    )
  }

  if (loadError) {
    return <ErrorState title="برنامه بارگذاری نشد" onRetry={() => void load()} />
  }

  if (!plan) {
    return (
      <div className="flex flex-col items-center px-6 pt-20 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-brand-soft">
          <CalendarDays className="size-6 text-brand-strong" strokeWidth={1.6} aria-hidden />
        </span>
        <h2 className="mt-5 text-lg font-bold">برنامه غذایی هنوز آماده نشده</h2>
        <p className="mt-2 max-w-72 text-[13px] leading-6 text-muted-foreground">
          هوش مصنوعی از بین گزینه‌های ثبت‌شده، برای هر روز هفته صبحانه، ناهار و شام پیشنهاد می‌چیند — فقط پیشنهاد، نه تکلیف.
        </p>
        <div className="mt-6 w-full max-w-xs">
          <p className="mb-2 text-xs font-medium text-muted-foreground">بودجه‌ات کدام است؟</p>
          {budgetChips}
        </div>
        <Button
          onClick={() => void generate()}
          disabled={generating}
          size="lg"
          className="mt-6 rounded-full px-10 font-bold"
        >
          {generating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
          {generating ? 'در حال چیدن برنامه…' : 'ساختن برنامه هفتگی'}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-[22px] font-bold leading-8">برنامه هفتگی</h1>
          <p className="tnum mt-0.5 text-xs text-muted-foreground">
            {monthFa(plan.startDate)} · تا {dayNumFa(plan.endDate)} {monthFa(plan.endDate)} · فقط پیشنهاد
          </p>
        </div>
        <button
          type="button"
          onClick={() => void generate()}
          disabled={generating}
          className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          {generating ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-3.5" aria-hidden />
          )}
          برنامه تازه
        </button>
      </div>

      {/* Week-level budget selector */}
      <div>
        {budgetChips}
        <p className="mt-1.5 px-1 text-[11px] leading-5 text-muted-foreground">
          {needsRegen
            ? 'برای اعمال بودجه روی کل هفته، «برنامه تازه» را بزن.'
            : `پیشنهاد کل هفته از گزینه‌های ثبت‌شده‌ی بودجه «${BUDGET_LABEL[normalizeBudget(plan.budgetLevel) ?? budget].title}» چیده شده — بودجهی هر روز را جدا هم می‌توانی عوض کنی.`}
        </p>
      </div>

      {/* Week strip — 7 quiet columns */}
      <div className="grid grid-cols-7 gap-1" role="tablist" aria-label="روزهای هفته">
        {plan.days.map((d, i) => {
          const isToday = d.date === todayKey
          const active = i === selectedDay
          const custom = normalizeBudget(d.budgetLevel) && normalizeBudget(d.budgetLevel) !== normalizeBudget(plan.budgetLevel)
          return (
            <button
              key={d.dayIndex}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectDay(i)}
              className={cn(
                'flex cursor-pointer flex-col items-center gap-0.5 rounded-2xl py-2.5 transition-all duration-200',
                active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <span className={cn('text-[10px]', active ? 'text-primary-foreground/70' : '')}>
                {weekdayFa(d.date)}
              </span>
              <span className={cn('tnum text-[15px] font-bold', active ? '' : 'text-foreground/85')}>
                {dayNumFa(d.date)}
              </span>
              <span
                className={cn(
                  'size-1 rounded-full',
                  isToday ? (active ? 'bg-primary-foreground' : 'bg-primary') : custom ? 'bg-energy' : 'bg-transparent',
                )}
                aria-label={isToday ? 'امروز' : custom ? 'بودجه شخصی‌سازی‌شده' : undefined}
              />
            </button>
          )
        })}
      </div>

      {/* Day header + per-day budget */}
      <div className="rounded-3xl border border-border/60 bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-bold">
            {weekdayFa(day?.date ?? plan.startDate)} {day ? dayNumFa(day.date) : ''} {day ? monthFa(day.date) : ''}
          </p>
          <span className="tnum text-xs text-muted-foreground">{fmtInt(dayTotalKcal)} kcal پیشنهادی</span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold text-muted-foreground">بودجه این روز</p>
          <button
            type="button"
            onClick={() => void regenerateDay()}
            disabled={regenningDay}
            className="flex cursor-pointer items-center gap-1.5 text-[11px] font-bold text-primary transition-opacity disabled:opacity-50"
          >
            {regenningDay ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-3.5" aria-hidden />
            )}
            {regenningDay ? 'در حال چیدن…' : 'پیشنهاد تازه این روز'}
          </button>
        </div>
        <div
          role="radiogroup"
          aria-label="بودجه این روز"
          className="mt-2 grid grid-cols-3 gap-1 rounded-full bg-muted/70 p-1"
        >
          {BUDGETS.map((b) => {
            const active = effectiveDayBudget === b
            return (
              <button
                key={b}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setDayBudgetSel(b)}
                title={BUDGET_LABEL[b].hint}
                className={cn(
                  'flex h-8 cursor-pointer items-center justify-center rounded-full text-xs font-medium transition-all duration-200',
                  active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {BUDGET_LABEL[b].title}
              </button>
            )
          })}
        </div>
        <p className="mt-1.5 px-1 text-[11px] leading-4 text-muted-foreground">
          {BUDGET_LABEL[effectiveDayBudget].hint}
          {dayBudgetSel && dayBudgetSel !== normalizeBudget(day?.budgetLevel)
            ? ' — با «پیشنهاد تازه این روز» اعمال شود.'
            : ''}
        </p>
      </div>

      {/* Day meals — editorial */}
      {grouped.map(({ meal, items }) => {
        const Icon = MEAL_ICON[meal] ?? Coffee
        const kcal = items.reduce((s, it) => s + it.kcal, 0)
        return (
          <section key={meal} aria-label={MEAL_LABEL[meal]}>
            <div className="flex items-center gap-2.5 px-0.5">
              <Icon className="size-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
              <h3 className="flex-1 text-sm font-bold">{MEAL_LABEL[meal]}</h3>
              <span className="tnum text-xs text-muted-foreground">{fmtInt(kcal)} kcal</span>
            </div>
            <ul className="mt-2 divide-y divide-border/60">
              {items.map((it) => (
                <li key={it.id} className="flex items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{it.titleFa}</span>
                    <span className="tnum mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                      {it.servingLabel ?? (it.grams ? `${enDigits(Math.round(it.grams))} گرم` : '')}
                      {' · '}
                      پ {fmtInt(it.proteinG)} / ک {fmtInt(it.carbsG)} / چ {fmtInt(it.fatG)}
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-[13px] font-bold">{fmtInt(it.kcal)}</span>
                  <button
                    type="button"
                    onClick={() => void swapItem(it)}
                    disabled={swappingId === it.id}
                    aria-label={`پیشنهاد دیگری برای ${it.titleFa}`}
                    className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary disabled:opacity-40"
                  >
                    {swappingId === it.id ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <RefreshCw className="size-3.5" aria-hidden />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      <p className="text-[11px] leading-5 text-muted-foreground">
        این برنامه فقط پیشنهاد است — مجبور به خوردن هیچ‌کدام نیستی. اگر پیشنهادی را دوست نداشتی با دکمهٔ رفرش عوضش کن؛
        آنچه واقعاً می‌خوری را در دفتر یا با اسکن ثبت کن.
      </p>
    </div>
  )
}
