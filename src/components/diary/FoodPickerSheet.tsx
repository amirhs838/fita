'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Minus, Plus, Search, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { api, ApiClientError } from '@/lib/client'
import { enDigits } from '@/lib/phone'
import { toastAwards } from '@/lib/awards-toast'
import type { AddLogData, FoodDto, FoodGuessData, FoodSearchData, MealType } from '@/lib/types'

interface FoodPickerSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mealType: MealType
  mealLabel: string
  date: string
  onAdded: () => void
}

/** Search → pick food → pick Iranian serving + quantity → deterministic add to diary. */
export function FoodPickerSheet({
  open,
  onOpenChange,
  mealType,
  mealLabel,
  date,
  onAdded,
}: FoodPickerSheetProps) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [results, setResults] = useState<FoodDto[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<FoodDto | null>(null)
  const [servingId, setServingId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [guessing, setGuessing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Debounce the search query
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300)
    return () => clearTimeout(t)
  }, [query])

  // Search on query change (only while picker open and nothing selected)
  useEffect(() => {
    if (!open || selected) return
    let cancelled = false
    setSearching(true)
    api<FoodSearchData>(`/api/foods/search?q=${encodeURIComponent(debounced)}&limit=25`)
      .then((data) => {
        if (!cancelled) setResults(data.foods)
      })
      .catch(() => {
        if (!cancelled) setResults([])
      })
      .finally(() => {
        if (!cancelled) setSearching(false)
      })
    return () => {
      cancelled = true
    }
  }, [debounced, open, selected])

  // Reset state whenever the sheet opens
  useEffect(() => {
    if (open) {
      setQuery('')
      setDebounced('')
      setResults([])
      setSelected(null)
      setServingId(null)
      setQuantity(1)
      setGuessing(false)
      setTimeout(() => inputRef.current?.focus(), 200)
    }
  }, [open])

  /** Search-list fallback: AI proposes identity + typical serving + nutrition,
   *  persists it as a searchable row, then the normal pick/add flow continues. */
  async function guess() {
    const q = debounced.trim()
    if (q.length < 2 || guessing) return
    setGuessing(true)
    try {
      const data = await api<FoodGuessData>('/api/foods/ai-guess', {
        method: 'POST',
        body: JSON.stringify({ query: q }),
      })
      toast.success(`حدس هوش مصنوعی: ${data.food.nameFa}`, {
        description: 'به بانک غذا اضافه شد؛ از این به بعد در جستجو پیدا می‌شود.',
      })
      pick(data.food)
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'حدس زدن انجام نشد. دوباره تلاش کن.')
    } finally {
      setGuessing(false)
    }
  }

  const activeServing = useMemo(
    () => selected?.servings.find((s) => s.id === servingId) ?? selected?.servings[0] ?? null,
    [selected, servingId],
  )

  const previewKcal = useMemo(() => {
    if (!selected) return 0
    const grams = activeServing ? activeServing.grams * quantity : 100 * quantity
    return Math.round((selected.kcalPer100g * grams) / 100)
  }, [selected, activeServing, quantity])

  function pick(food: FoodDto) {
    setSelected(food)
    setServingId(food.servings.find((s) => s.isDefault)?.id ?? food.servings[0]?.id ?? null)
    setQuantity(1)
  }

  async function addToDiary() {
    if (!selected) return
    setSubmitting(true)
    try {
      const data = await api<AddLogData>('/api/diary/log', {
        method: 'POST',
        body: JSON.stringify({
          date,
          mealType,
          items: [
            {
              foodId: selected.id,
              ...(activeServing ? { servingId: activeServing.id } : {}),
              quantity,
            },
          ],
        }),
      })
      toast.success(`${selected.nameFa} به ${mealLabel} اضافه شد`, {
        description: `${enDigits(data.kcal)} کیلوکالری ثبت شد`,
      })
      toastAwards(data.awards)
      onAdded()
      onOpenChange(false)
    } catch {
      toast.error('ثبت غذا انجام نشد. دوباره تلاش کن.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-[28px] px-5 pb-8 pt-3 sm:max-w-md sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2"
      >
        <SheetHeader className="text-start px-1">
          <SheetTitle className="text-lg font-bold">افزودن به {mealLabel}</SheetTitle>
          <SheetDescription className="text-[13px]">
            {selected ? 'واحد و مقدار را مشخص کن' : 'غذا را جستجو کن'}
          </SheetDescription>
        </SheetHeader>

        {!selected ? (
          <div className="mt-2 flex flex-col">
            <div className="relative">
              <Search
                className="absolute start-3.5 top-1/2 size-4.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="مثلاً قورمه سبزی، کباب، برنج…"
                className="h-13 rounded-2xl border-border/80 bg-card ps-11 text-[15px]"
                aria-label="جستجوی غذا"
              />
            </div>

            <div className="scroll-thin mt-3 max-h-[46dvh] min-h-40 space-y-1.5 overflow-y-auto pb-1">
              {searching && results.length === 0 ? (
                <div className="space-y-2 px-1 pt-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-xl" />
                  ))}
                </div>
              ) : results.length === 0 ? (
                <div className="space-y-3 px-1 pt-2">
                  <div className="px-4 py-3 text-center">
                    <p className="text-sm font-medium">چیزی پیدا نشد</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      اسم دیگری را امتحان کن؛ یا کلمه‌ی کوتاه‌تری بنویس.
                    </p>
                  </div>
                  {debounced.trim().length >= 2 && (
                    <div className="rounded-2xl border border-brand-soft bg-brand-soft/50 p-4">
                      <div className="flex items-start gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card shadow-[0_1px_3px_oklch(0.175_0_0/0.06)]">
                          <Sparkles className="size-4.5 text-brand-strong" strokeWidth={1.8} aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold">پیدا نشد؟ هوش مصنوعی حدس می‌زند</p>
                          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                            «{debounced.trim()}» را تشخیص می‌دهد، مقدار معمول و ارزش غذایی‌اش را تخمین می‌زند و به بانک غذا اضافه می‌کند.
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={() => void guess()}
                        disabled={guessing}
                        className="mt-3 h-11 w-full rounded-full font-bold"
                      >
                        {guessing ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <Sparkles className="size-4" aria-hidden />
                        )}
                        {guessing ? 'در حال حدس زدن…' : 'حدس هوش مصنوعی'}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                results.map((food) => {
                  const def = food.servings.find((s) => s.isDefault) ?? food.servings[0]
                  return (
                    <button
                      key={food.id}
                      type="button"
                      onClick={() => pick(food)}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-2 py-3 text-start transition-colors hover:bg-muted/60"
                    >
                      {food.imageUrl ? (
                        <img
                          src={food.imageUrl}
                          alt=""
                          aria-hidden
                          className="size-11 shrink-0 rounded-xl object-cover"
                        />
                      ) : null}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{food.nameFa}</span>
                        <span className="tnum mt-0.5 block text-xs text-muted-foreground">
                          {def
                            ? `${def.labelFa} · ${enDigits(Math.round((food.kcalPer100g * def.grams) / 100))} کیلوکالری`
                            : `${enDigits(food.kcalPer100g)} کیلوکالری در 100 گرم`}
                        </span>
                      </span>
                      {food.isIranian && (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                          ایرانی
                        </span>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        ) : (
          <div className="mt-2 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-3">
                {selected.imageUrl && (
                  <img
                    src={selected.imageUrl}
                    alt=""
                    aria-hidden
                    className="size-12 shrink-0 rounded-xl object-cover"
                  />
                )}
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold">{selected.nameFa}</p>
                  {selected.source === 'AI_ESTIMATE' && (
                    <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-medium text-brand-strong">
                      <Sparkles className="size-3" aria-hidden />
                      حدس هوش مصنوعی
                    </span>
                  )}
                  {activeServing && (
                    <p className="tnum mt-0.5 text-xs text-muted-foreground">
                      {activeServing.labelFa} ≈ {enDigits(Math.round(activeServing.grams))} گرم
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="بازگشت به جستجو"
                className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            {selected.servings.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">واحد</p>
                <div className="flex flex-wrap gap-2">
                  {selected.servings.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setServingId(s.id)}
                      className={`cursor-pointer rounded-full px-4 py-2 text-xs font-medium transition-all ${
                        activeServing?.id === s.id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/70 text-foreground/80 hover:bg-muted'
                      }`}
                    >
                      {s.labelFa}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">تعداد</p>
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-11 rounded-full"
                  onClick={() => setQuantity((q) => Math.max(0.5, Math.round((q - 0.5) * 2) / 2))}
                  aria-label="کمتر"
                  disabled={quantity <= 0.5}
                >
                  <Minus className="size-4" aria-hidden />
                </Button>
                <span className="tnum min-w-12 text-center text-xl font-bold">
                  {enDigits(quantity)}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-11 rounded-full"
                  onClick={() => setQuantity((q) => Math.min(20, Math.round((q + 0.5) * 2) / 2))}
                  aria-label="بیشتر"
                  disabled={quantity >= 20}
                >
                  <Plus className="size-4" aria-hidden />
                </Button>
                <span className="tnum ms-auto text-sm text-muted-foreground">
                  ≈ {enDigits(previewKcal)} کیلوکالری
                </span>
              </div>
            </div>

            <Button
              onClick={() => void addToDiary()}
              disabled={submitting}
              className="h-13 rounded-full text-base font-bold"
            >
              {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
              افزودن به {mealLabel}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
