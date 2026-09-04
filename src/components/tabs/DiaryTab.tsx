'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronRight,
  ChevronLeft,
  Coffee,
  Cookie,
  Droplets,
  MoonStar,
  Plus,
  Sun,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { MacroStrip } from '@/components/fita/MacroStrip'
import { ErrorState } from '@/components/fita/States'
import { FoodPickerSheet } from '@/components/diary/FoodPickerSheet'
import { api } from '@/lib/client'
import { faDate, todayIso } from '@/lib/date'
import { enDigits } from '@/lib/phone'
import { MEAL_LABEL } from '@/lib/labels'
import type {
  DiaryData,
  DiaryItem,
  DiaryLog,
  MealType,
  SummaryData,
  WaterData,
} from '@/lib/types'
import { cn } from '@/lib/utils'

const MEALS: MealType[] = ['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER']
const MEAL_ICON: Record<MealType, typeof Coffee> = {
  BREAKFAST: Coffee,
  LUNCH: Sun,
  SNACK: Cookie,
  DINNER: MoonStar,
}
const WATER_TARGET_ML = 2000
const GLASS_ML = 250

function fmtInt(n: number): string {
  return enDigits(Math.round(n).toLocaleString('en-US'))
}

function dayLabel(date: string, isToday: boolean): string {
  const d = new Date(`${date}T12:00:00`)
  const fa = faDate(d)
  return isToday ? `امروز · ${fa}` : fa
}

function shiftDay(date: string, delta: number): string {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + delta)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function DiaryTab({ refreshSignal = 0 }: { refreshSignal?: number }) {
  const today = todayIso()
  const [date, setDate] = useState(today)
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [diary, setDiary] = useState<DiaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [pickerMeal, setPickerMeal] = useState<MealType | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [waterBusy, setWaterBusy] = useState(false)

  const isToday = date === today
  const canGoNext = !isToday

  const load = useCallback(async (d: string) => {
    setLoading(true)
    setError(false)
    try {
      const [s, diaryData] = await Promise.all([
        api<SummaryData>(`/api/summary?date=${d}`),
        api<DiaryData>(`/api/diary?date=${d}`),
      ])
      setSummary(s)
      setDiary(diaryData)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(date)
  }, [date, load])

  // External change (e.g. scan committed from the FAB while diary is open)
  useEffect(() => {
    if (refreshSignal > 0) void load(date)
  }, [refreshSignal])

  const logsByMeal = useMemo(() => {
    const map: Record<MealType, DiaryLog[]> = { BREAKFAST: [], LUNCH: [], SNACK: [], DINNER: [] }
    for (const log of diary?.logs ?? []) {
      if (log.mealType in map) map[log.mealType as MealType].push(log)
    }
    return map
  }, [diary])

  const mealKcal = useMemo(() => {
    const map = {} as Record<MealType, number>
    for (const meal of MEALS) {
      map[meal] = logsByMeal[meal].reduce(
        (sum, log) => sum + log.items.reduce((s, it) => s + it.kcal, 0),
        0,
      )
    }
    return map
  }, [logsByMeal])

  async function deleteLog(logId: string) {
    setDeletingId(logId)
    try {
      await api(`/api/diary/log/${logId}`, { method: 'DELETE' })
      await load(date)
    } catch {
      toast.error('حذف انجام نشد. دوباره تلاش کن.')
    } finally {
      setDeletingId(null)
    }
  }

  async function water(action: 'add' | 'undo') {
    setWaterBusy(true)
    try {
      const data = await api<WaterData>('/api/water', {
        method: action === 'add' ? 'POST' : 'DELETE',
        ...(action === 'add'
          ? { body: JSON.stringify({ date, amountMl: GLASS_ML }) }
          : {}),
      })
      setSummary((prev) => (prev && prev.date === date ? { ...prev, waterMl: data.waterMl } : prev))
    } catch {
      toast.error(action === 'add' ? 'ثبت آب انجام نشد.' : 'بازگردانی انجام نشد.')
    } finally {
      setWaterBusy(false)
    }
  }

  const consumed = summary?.consumed
  const targets = summary?.targets
  const totalKcal = consumed?.kcal ?? 0
  const kcalPct =
    targets && targets.kcal > 0 ? Math.min(100, (totalKcal / targets.kcal) * 100) : 0
  const remaining = targets ? targets.kcal - totalKcal : 0
  const glasses = Math.min(8, Math.floor((summary?.waterMl ?? 0) / GLASS_ML))
  const hasAnyLog = (diary?.logs.length ?? 0) > 0

  return (
    <div className="space-y-8">
      {/* Date navigation — open row */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => setDate((d) => shiftDay(d, -1))}
          aria-label="روز قبل"
          className="flex size-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>
        <div className="flex flex-col items-center">
          <span className="tnum text-sm font-bold">{dayLabel(date, isToday)}</span>
          {!isToday && (
            <button
              type="button"
              onClick={() => setDate(today)}
              className="mt-0.5 cursor-pointer text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              بازگشت به امروز
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDate((d) => shiftDay(d, 1))}
          disabled={!canGoNext}
          aria-label="روز بعد"
          className="flex size-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
      </div>

      {loading ? (
        <DiarySkeleton />
      ) : error ? (
        <ErrorState title="دفتر غذایی بارگذاری نشد" onRetry={() => void load(date)} />
      ) : (
        <>
          {/* Day summary — navy hero card (the palette's deep surface) */}
          {targets ? (
            <section aria-label="خلاصه روز" className="space-y-5">
              <div className="rounded-3xl bg-foreground px-5 py-5 text-white shadow-[0_10px_28px_-14px_oklch(0.25_0.05_230)]">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium text-white/60">مصرف امروز</p>
                    <p className="tnum mt-1 text-[34px] font-bold leading-none tracking-tight text-white">
                      {fmtInt(totalKcal)}
                      <span className="ms-1.5 text-sm font-normal text-white/60">kcal</span>
                    </p>
                  </div>
                  <p className="tnum pb-1 text-[13px] text-white/70">
                    از {fmtInt(targets.kcal)} ·{' '}
                    {remaining >= 0 ? (
                      <span className="font-bold text-energy">
                        {fmtInt(Math.abs(remaining))} باقی‌مانده
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-destructive px-2.5 py-0.5 text-[11px] font-bold text-white">
                        {fmtInt(Math.abs(remaining))} اضافه
                      </span>
                    )}
                  </p>
                </div>
                <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full bg-energy transition-[width] duration-700 ease-out"
                    style={{ width: `${kcalPct}%` }}
                    role="progressbar"
                    aria-valuenow={Math.round(kcalPct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="پیشرفت کالری روز"
                  />
                </div>
              </div>
              <MacroStrip
                items={[
                  { label: 'پروتئین', value: consumed?.proteinG ?? 0, target: targets.proteinG },
                  { label: 'کربوهیدرات', value: consumed?.carbG ?? 0, target: targets.carbG },
                  { label: 'چربی', value: consumed?.fatG ?? 0, target: targets.fatG },
                  { label: 'فیبر', value: consumed?.fiberG ?? 0, target: targets.fiberG },
                ]}
              />
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">
              برای نمایش اهداف، ابتدا پروفایل را تکمیل کن.
            </p>
          )}

          {/* Meals — editorial sections */}
          {MEALS.map((meal) => {
            const Icon = MEAL_ICON[meal]
            const logs = logsByMeal[meal]
            const items: DiaryItem[] = logs.flatMap((l) => l.items)
            return (
              <section key={meal} aria-label={MEAL_LABEL[meal]}>
                <div className="flex items-center gap-2.5 px-0.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft">
                    <Icon className="size-4 text-brand-strong" strokeWidth={1.8} aria-hidden />
                  </span>
                  <h3 className="flex-1 text-sm font-bold">{MEAL_LABEL[meal]}</h3>
                  {mealKcal[meal] > 0 && (
                    <span className="tnum text-xs text-muted-foreground">
                      {fmtInt(mealKcal[meal])} kcal
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setPickerMeal(meal)}
                    className="flex cursor-pointer items-center gap-1 rounded-full bg-brand-soft px-3 py-1.5 text-xs font-bold text-brand-strong transition-colors hover:bg-primary hover:text-primary-foreground"
                  >
                    <Plus className="size-3.5" aria-hidden />
                    افزودن
                  </button>
                </div>

                {items.length > 0 && (
                  <ul className="mt-2 divide-y divide-border/60">
                    <AnimatePresence initial={false}>
                      {logs.flatMap((log) =>
                        log.items.map((item) => (
                          <motion.li
                            key={item.id}
                            layout
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="flex items-center gap-3 py-2.5">
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm">{item.nameFa}</span>
                                <span className="tnum mt-0.5 block text-[11px] text-muted-foreground">
                                  {item.servingLabel ?? (item.grams ? `${enDigits(Math.round(item.grams))} گرم` : '')}
                                  {' · '}
                                  پروتئین {enDigits(Math.round(item.proteinG))}گ
                                </span>
                              </span>
                              <span className="tnum shrink-0 text-[13px] font-bold">
                                {fmtInt(item.kcal)}
                              </span>
                              <button
                                type="button"
                                onClick={() => void deleteLog(log.id)}
                                disabled={deletingId === log.id}
                                aria-label={`حذف ${item.nameFa}`}
                                className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                              >
                                {deletingId === log.id ? (
                                  <span className="size-3.5 animate-spin rounded-full border border-current border-t-transparent" />
                                ) : (
                                  <Trash2 className="size-3.5" aria-hidden />
                                )}
                              </button>
                            </div>
                          </motion.li>
                        )),
                      )}
                    </AnimatePresence>
                  </ul>
                )}
              </section>
            )
          })}

          {!hasAnyLog && (
            <p className="pt-1 text-center text-xs leading-6 text-muted-foreground">
              هنوز چیزی ثبت نکردی — با «افزودن» یا اسکن عکس شروع کن.
            </p>
          )}

          {/* Water — open section */}
          <section aria-label="آب" className="space-y-3">
            <div className="flex items-center justify-between px-0.5">
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <Droplets className="size-4 text-brand" strokeWidth={1.8} aria-hidden />
                آب
              </h3>
              <span className="tnum text-xs text-muted-foreground">
                {fmtInt(summary?.waterMl ?? 0)} از {fmtInt(WATER_TARGET_ML)} میلی‌لیتر
              </span>
            </div>
            <div className="flex items-center gap-1.5" role="img" aria-label={`${glasses} لیوان از 8 لیوان`}>
              {Array.from({ length: 8 }).map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-1.5 flex-1 rounded-full transition-colors duration-300',
                    i < glasses ? 'bg-primary' : 'bg-muted',
                  )}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="h-10 flex-1 rounded-full text-sm"
                onClick={() => void water('add')}
                disabled={waterBusy}
              >
                <Plus className="size-4" aria-hidden />
                یک لیوان
              </Button>
              <Button
                variant="ghost"
                className="h-10 rounded-full text-sm text-muted-foreground"
                onClick={() => void water('undo')}
                disabled={waterBusy || (summary?.waterMl ?? 0) === 0}
              >
                بازگردانی
              </Button>
            </div>
          </section>
        </>
      )}

      <FoodPickerSheet
        open={pickerMeal !== null}
        onOpenChange={(open) => {
          if (!open) setPickerMeal(null)
        }}
        mealType={pickerMeal ?? 'LUNCH'}
        mealLabel={MEAL_LABEL[pickerMeal ?? 'LUNCH']}
        date={date}
        onAdded={() => void load(date)}
      />
    </div>
  )
}

function DiarySkeleton() {
  return (
    <div className="space-y-8 pt-2">
      <div className="space-y-3">
        <div className="h-9 w-40 animate-pulse rounded-xl bg-muted" />
        <div className="h-1 w-full animate-pulse rounded-full bg-muted" />
        <div className="h-10 w-full animate-pulse rounded-xl bg-muted" />
      </div>
      {MEALS.map((m) => (
        <div key={m} className="h-12 w-full animate-pulse rounded-xl bg-muted/70" />
      ))}
    </div>
  )
}
