'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Camera, Check, ImageUp, Loader2, Minus, PencilLine, Plus, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { api, ApiClientError } from '@/lib/client'
import { enDigits } from '@/lib/phone'
import { cn } from '@/lib/utils'
import { toastAwards } from '@/lib/awards-toast'
import type { AddLogData, MealType, ScanData, ScanFoodItem } from '@/lib/types'

interface ScanSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onLogged: () => void
  onManualEntry: () => void
  /** Opens the subscription paywall when the trial limit is reached (Phase 10). */
  onOpenPaywall?: () => void
}

type Phase = 'pick' | 'scanning' | 'review'

const MEALS: { id: MealType; label: string }[] = [
  { id: 'BREAKFAST', label: 'صبحانه' },
  { id: 'LUNCH', label: 'ناهار' },
  { id: 'SNACK', label: 'میان‌وعده' },
  { id: 'DINNER', label: 'شام' },
]

function mealByHour(hour: number): MealType {
  if (hour < 10) return 'BREAKFAST'
  if (hour < 15) return 'LUNCH'
  if (hour < 18) return 'SNACK'
  return 'DINNER'
}

function confidenceLabel(c: number): { text: string; className: string } {
  if (c >= 0.75) return { text: 'تشخیص خوب', className: 'bg-brand-soft text-brand-strong' }
  if (c >= 0.4) return { text: 'نسبتاً قطعی', className: 'bg-muted text-foreground/80' }
  return { text: 'نامطمئن', className: 'bg-muted text-muted-foreground' }
}

/** Downscale to ≤1024px JPEG (0.85) in-browser before upload — privacy + speed. */
async function fileToDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('image-decode'))
      el.src = objectUrl
    })
    const maxSide = 1024
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.width * scale))
    canvas.height = Math.max(1, Math.round(img.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/**
 * Food-vision flow: transient photo → AI analysis → user reviews and
 * corrects grams → deterministic commit. The photo never leaves this component
 * except inside the analyze request body — nothing is stored client-side.
 */
export function ScanSheet({ open, onOpenChange, onLogged, onManualEntry, onOpenPaywall }: ScanSheetProps) {
  const [phase, setPhase] = useState<Phase>('pick')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [result, setResult] = useState<ScanData | null>(null)
  const [items, setItems] = useState<(ScanFoodItem & { grams: number })[]>([])
  const [meal, setMeal] = useState<MealType>('LUNCH')
  const [error, setError] = useState<{ code: string; message: string } | null>(null)
  const [committing, setCommitting] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const lastFileRef = useRef<File | null>(null)

  // Reset whenever the sheet reopens
  useEffect(() => {
    if (open) {
      setPhase('pick')
      setPreviewUrl(null)
      setResult(null)
      setItems([])
      setMeal(mealByHour(new Date().getHours()))
      setError(null)
      lastFileRef.current = null
    }
  }, [open])

  const lowConfidence = result !== null && result.foods.length > 0 && result.overallConfidence < 0.5

  async function analyze(file: File) {
    lastFileRef.current = file
    setError(null)
    setPhase('scanning')
    try {
      const dataUrl = await fileToDataUrl(file)
      setPreviewUrl(dataUrl)
      const data = await api<ScanData>('/api/scan', {
        method: 'POST',
        body: JSON.stringify({ imageDataUrl: dataUrl }),
      })
      setResult(data)
      // Server now returns ONE dominant dish; this sort is purely defensive.
      const dominant =
        data.foods.length > 1
          ? [...data.foods].sort(
              (a, b) =>
                b.estimatedGrams * b.kcalPer100g - a.estimatedGrams * a.kcalPer100g,
            )[0]
          : data.foods[0]
      setItems(dominant ? [{ ...dominant, grams: dominant.estimatedGrams }] : [])
      setPhase('review')
    } catch (err) {
      setPreviewUrl(null)
      if (err instanceof ApiClientError) {
        setError({ code: err.code, message: err.message })
      } else {
        setError({ code: 'INTERNAL', message: 'خطای غیرمنتظره‌ای رخ داد.' })
      }
      setPhase('pick')
    }
  }

  function retry() {
    if (lastFileRef.current) void analyze(lastFileRef.current)
  }

  async function commit() {
    if (items.length === 0) return
    setCommitting(true)
    try {
      const data = await api<AddLogData>('/api/scan/commit', {
        method: 'POST',
        body: JSON.stringify({
          mealType: meal,
          items: items.map((it) => ({
            foodId: it.foodId,
            grams: it.grams,
            confidence: it.confidence,
          })),
        }),
      })
      toast.success('ثبت شد', {
        description: `${enDigits(data.itemCount)} مورد به ${MEALS.find((m) => m.id === meal)?.label} اضافه شد · ${enDigits(data.kcal)} کیلوکالری`,
      })
      toastAwards(data.awards)
      onOpenChange(false)
      onLogged()
    } catch {
      toast.error('ثبت انجام نشد. دوباره تلاش کن.')
    } finally {
      setCommitting(false)
    }
  }

  const limitReached =
    error?.code === 'SCAN_LIMIT_REACHED' || error?.code === 'SUBSCRIPTION_EXPIRED'

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
          <SheetTitle className="text-lg font-bold">
            {phase === 'review' ? 'غذا شناسایی شد' : 'اسکن با عکس'}
          </SheetTitle>
          <SheetDescription className="text-[13px]">
            {phase === 'review'
              ? 'مقدارها را اصلاح کن و ثبت کن'
              : phase === 'scanning'
                ? 'در حال بررسی غذای شما…'
                : 'از غذات عکس بگیر'}
          </SheetDescription>
        </SheetHeader>

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void analyze(f)
          }}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void analyze(f)
          }}
        />

        <AnimatePresence mode="wait" initial={false}>
          {phase === 'pick' && (
            <motion.div
              key="pick"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-3"
            >
              {error && (
                <div role="alert" className="rounded-2xl bg-muted/60 p-4 text-start">
                  <p className="flex items-center gap-2 text-sm font-bold">
                    <AlertTriangle className="size-4" aria-hidden />
                    {limitReached ? 'اسکن‌های آزمایشی تمام شد' : 'اسکن انجام نشد'}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {limitReached
                      ? 'برای اسکن نامحدود، اشتراک فیتا پلاس را فعال کن.'
                      : error.message}
                  </p>
                  <div className="mt-3 flex gap-2">
                    {!limitReached && (
                      <Button variant="outline" size="sm" className="rounded-full" onClick={retry} disabled={!lastFileRef.current}>
                        تلاش مجدد
                      </Button>
                    )}
                    {limitReached && onOpenPaywall && (
                      <Button
                        size="sm"
                        className="rounded-full"
                        onClick={() => {
                          onOpenChange(false)
                          onOpenPaywall()
                        }}
                      >
                        فعال‌سازی اشتراک
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => {
                        onOpenChange(false)
                        onManualEntry()
                      }}
                    >
                      <PencilLine className="size-3.5" aria-hidden />
                      ورود دستی
                    </Button>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="flex w-full cursor-pointer items-center gap-4 rounded-3xl bg-energy p-5 text-start text-foreground shadow-[0_10px_28px_-10px_var(--energy)] transition-all hover:brightness-[0.98] active:scale-[0.99]"
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground text-primary-foreground">
                  <Camera className="size-5.5" strokeWidth={1.8} aria-hidden />
                </span>
                <span className="flex-1">
                  <span className="block text-base font-bold">گرفتن عکس</span>
                  <span className="mt-0.5 block text-xs leading-5 text-foreground/90">
                    دوربین باز می‌شود؛ بشقاب را کامل در کادر بگیر
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                className="flex w-full cursor-pointer items-center gap-4 rounded-3xl bg-muted/60 p-5 text-start transition-colors hover:bg-muted active:scale-[0.99]"
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-card shadow-[0_1px_3px_oklch(0.175_0_0/0.08)]">
                  <ImageUp className="size-5" strokeWidth={1.8} aria-hidden />
                </span>
                <span className="flex-1">
                  <span className="block text-base font-bold">انتخاب از گالری</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">عکسی که قبلاً گرفته‌ای</span>
                </span>
              </button>
              <p className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
                <ShieldCheck className="size-3.5" aria-hidden />
                عکس فقط برای تشخیص پردازش می‌شود و هرگز ذخیره نمی‌شود.
              </p>
            </motion.div>
          )}

          {phase === 'scanning' && (
            <motion.div
              key="scanning"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center pb-4 pt-2"
              aria-live="polite"
            >
              <div className="scanline relative flex size-44 items-center justify-center overflow-hidden rounded-3xl bg-muted">
                {previewUrl ? (
                  // transient in-memory preview — never uploaded/stored
                  <img src={previewUrl} alt="عکس غذای در حال بررسی" className="size-full object-cover" />
                ) : (
                  <Loader2 className="size-7 animate-spin text-muted-foreground" aria-hidden />
                )}
              </div>
              <p className="mt-5 text-sm font-bold">در حال بررسی غذای شما…</p>
              <p className="mt-1 text-xs text-muted-foreground">معمولاً چند ثانیه طول می‌کشد</p>
            </motion.div>
          )}

          {phase === 'review' && result && (
            <motion.div
              key="review"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {items.length === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-sm font-bold">نتوانستیم با اطمینان غذا را شناسایی کنیم</p>
                  <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                    عکس را نزدیک‌تر و با نور بهتر دوباره امتحان کن، یا غذا را دستی وارد کن.
                  </p>
                  <div className="mt-4 flex justify-center gap-2">
                    <Button variant="outline" size="sm" className="rounded-full" onClick={retry}>
                      عکس دیگر
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => {
                        onOpenChange(false)
                        onManualEntry()
                      }}
                    >
                      <PencilLine className="size-3.5" aria-hidden />
                      جستجوی دستی
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {items.length > 1 && (
                    <div role="alert" className="flex items-start gap-2 rounded-2xl bg-muted/60 p-3.5 text-xs leading-5">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span>چند مورد برگشت؛ مهم‌ترین بخش بشقاب نشان داده شد.</span>
                    </div>
                  )}

                  {lowConfidence && (
                    <div role="alert" className="flex items-start gap-2 rounded-2xl bg-muted/60 p-3.5 text-xs leading-5">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span>اطمینان تشخیص پایین است؛ نام و مقدار را قبل از ثبت بررسی کن.</span>
                    </div>
                  )}

                  {(() => {
                    const it = items[0]
                    const conf = confidenceLabel(it.confidence)
                    const k = it.grams / 100
                    const kcal = Math.round((it.kcalPer100g * it.grams) / 100)
                    const macros = [
                      { label: 'پروتئین', value: Math.round(it.proteinPer100g * k) },
                      { label: 'کربوهیدرات', value: Math.round(it.carbsPer100g * k) },
                      { label: 'چربی', value: Math.round(it.fatPer100g * k) },
                    ]
                    return (
                      <div className="overflow-hidden rounded-3xl border border-border/70 bg-card">
                        {/* identity row */}
                        <div className="flex items-center gap-3.5 p-4">
                          {previewUrl && (
                            <img
                              src={previewUrl}
                              alt="عکس غذای اسکن‌شده"
                              className="size-20 shrink-0 rounded-2xl object-cover"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium text-muted-foreground">
                              غذای تشخیص داده‌شده
                            </p>
                            <p className="mt-0.5 truncate text-lg font-bold leading-7">{it.nameFa}</p>
                            <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', conf.className)}>
                                {conf.text}
                              </span>
                              {!it.matchedToDb && (
                                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                                  مقدار مرجع تخمینی
                                </span>
                              )}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={retry}
                            aria-label="تشخیص اشتباه بود؛ عکس دیگر"
                            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <X className="size-4.5" aria-hidden />
                          </button>
                        </div>

                        {/* kcal + macros */}
                        <div className="flex items-end justify-between border-y border-border/60 bg-brand-soft/40 px-4 py-3">
                          <div>
                            <p className="tnum text-3xl font-bold leading-none text-brand-strong">
                              {enDigits(kcal)}
                            </p>
                            <p className="mt-1 text-[11px] text-muted-foreground">کیلوکالری تخمینی</p>
                          </div>
                          <div className="flex flex-col items-end gap-1.5">
                            {macros.map((m) => (
                              <p key={m.label} className="text-[11px] text-muted-foreground">
                                {m.label}
                                <span className="tnum ms-1.5 font-bold text-foreground">
                                  {enDigits(m.value)}
                                </span>
                                <span className="ms-0.5 text-[10px]">گرم</span>
                              </p>
                            ))}
                          </div>
                        </div>

                        {/* portion control */}
                        <div className="p-4">
                          <p className="mb-2 text-xs font-medium text-muted-foreground">
                            مقدار غذا — اگر تخمین اشتباه است اصلاح کن
                          </p>
                          <div className="flex items-center gap-3">
                            <Button
                              variant="outline"
                              size="icon"
                              className="size-10 rounded-full"
                              aria-label="کمتر"
                              onClick={() =>
                                setItems((arr) =>
                                  arr.map((x) =>
                                    x.foodId === it.foodId
                                      ? { ...x, grams: Math.max(5, x.grams - 25) }
                                      : x,
                                  ),
                                )
                              }
                            >
                              <Minus className="size-4" aria-hidden />
                            </Button>
                            <div className="tnum flex-1 text-center">
                              <span className="text-xl font-bold">{enDigits(it.grams)}</span>
                              <span className="ms-1 text-xs text-muted-foreground">گرم</span>
                            </div>
                            <Button
                              variant="outline"
                              size="icon"
                              className="size-10 rounded-full"
                              aria-label="بیشتر"
                              onClick={() =>
                                setItems((arr) =>
                                  arr.map((x) =>
                                    x.foodId === it.foodId
                                      ? { ...x, grams: Math.min(2000, x.grams + 25) }
                                      : x,
                                  ),
                                )
                              }
                            >
                              <Plus className="size-4" aria-hidden />
                            </Button>
                          </div>
                          {it.grams !== it.estimatedGrams && (
                            <button
                              type="button"
                              onClick={() =>
                                setItems((arr) =>
                                  arr.map((x) =>
                                    x.foodId === it.foodId
                                      ? { ...x, grams: x.estimatedGrams }
                                      : x,
                                  ),
                                )
                              }
                              className="mt-2 w-full cursor-pointer text-center text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                            >
                              بازگشت به تخمین هوشمند: {enDigits(it.estimatedGrams)} گرم
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })()}

                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">ثبت در وعده</p>
                    <div className="flex flex-wrap gap-2">
                      {MEALS.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setMeal(m.id)}
                          className={cn(
                            'cursor-pointer rounded-full px-4 py-2 text-xs font-medium transition-all',
                            meal === m.id
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted/70 text-foreground/80 hover:bg-muted',
                          )}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Button
                    onClick={() => void commit()}
                    disabled={committing || items.length === 0}
                    className="h-13 w-full rounded-full text-base font-bold"
                  >
                    {committing ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Check className="size-4" aria-hidden />
                    )}
                    تأیید و ثبت
                  </Button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </SheetContent>
    </Sheet>
  )
}
