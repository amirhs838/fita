'use client'

import { useMemo } from 'react'
import { Info, Ruler, Sparkles } from 'lucide-react'
import type { StepProps } from '@/components/onboarding/StepAbout'
import { computeBodyAnalysis } from '@/lib/body-metrics'
import { enDigits } from '@/lib/phone'
import { cn } from '@/lib/utils'

const fmt = (n: number) => enDigits(Math.round(n).toLocaleString('en-US'))
const fmt1 = (n: number) => enDigits((Math.round(n * 10) / 10).toLocaleString('en-US'))
/** Ratios (WHtR/WHR) need 2 decimals — the 0.5/0.55 risk lines live there. */
const fmt2 = (n: number) => enDigits((Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 }))

const TONE_TEXT = {
  GOOD: 'text-brand-strong',
  WARN: 'text-energy-strong',
  BAD: 'text-destructive',
} as const

/** Final wizard step — professional body analysis from the numbers just entered. */
export function StepResults({ draft }: StepProps) {
  const analysis = useMemo(() => {
    const gender = draft.gender
    const height = Number(draft.heightCm)
    const weight = Number(draft.currentWeightKg)
    if (!gender || !Number.isFinite(height) || !Number.isFinite(weight) || height <= 0 || weight <= 0) {
      return null
    }
    const m = draft.measurements
    const num = (s: string): number | null => {
      const v = Number(s)
      return s.trim() && Number.isFinite(v) && v > 0 ? v : null
    }
    return computeBodyAnalysis({
      gender,
      heightCm: height,
      weightKg: weight,
      waistCm: num(m.waistCm),
      hipCm: num(m.hipCm),
      neckCm: num(m.neckCm),
    })
  }, [draft.gender, draft.heightCm, draft.currentWeightKg, draft.measurements])

  if (!analysis) {
    return (
      <div className="space-y-4 pt-6 text-center">
        <p className="text-sm text-muted-foreground">اطلاعات پایه کامل نیست — یک مرحله عقب برگرد و قد/وزن را کامل کن.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-[22px] font-bold leading-8">
          <Sparkles className="size-5 text-energy-strong" aria-hidden />
          تحلیل بدن تو
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          با جدیدترین روش‌های اعتبارسنجی‌شده (نیروی دریایی آمریکا و RFM) از همین اندازه‌های خانگی.
        </p>
      </div>

      {/* Body fat — the headline metric when we can estimate it */}
      {analysis.bodyFat && analysis.bodyFatLabelFa ? (
        <div className="rounded-3xl bg-card p-5 shadow-[0_10px_30px_-18px_rgba(9,38,52,0.35)] ring-1 ring-border/60">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] font-bold text-muted-foreground">درصد تخمینی چربی بدن</p>
              <p className="tnum mt-1 text-[40px] font-extrabold leading-none tracking-tight text-foreground">
                {fmt1(analysis.bodyFat.pct)}
                <span className="ms-1 text-base font-bold text-muted-foreground">٪</span>
              </p>
              <p className={cn('mt-2 text-[13px] font-bold', TONE_TEXT[analysis.bodyFatTone ?? 'WARN'])}>
                {analysis.bodyFatLabelFa}
              </p>
            </div>
            <span className="rounded-full bg-brand-soft px-2.5 py-1 text-[10px] font-bold text-brand-strong">
              {analysis.bodyFat.methodFa}
            </span>
          </div>
          {analysis.leanKg != null && (
            <p className="tnum mt-4 border-t border-border/60 pt-3 text-xs text-muted-foreground">
              توده بدون چربی: <span className="font-bold text-foreground">{fmt1(analysis.leanKg)} کیلوگرم</span>
              {analysis.ffmiVal != null && <> · شاخص FFMI: <span className="font-bold text-foreground">{fmt1(analysis.ffmiVal)}</span></>}
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-start gap-2.5 rounded-2xl bg-brand-soft/70 px-4 py-3.5">
          <Ruler className="mt-0.5 size-4 shrink-0 text-brand-strong" aria-hidden />
          <p className="text-[13px] leading-6 text-foreground/90">
            برای تخمین درصد چربی بدن، دور کمر و دور گردن (و برای زنان دور باسن) را در مرحله قبل وارد کن — با همین متر خانگی کافی است.
          </p>
        </div>
      )}

      {/* Central adiposity — WHtR, the modern primary risk gauge */}
      {analysis.whtr && (
        <div className="rounded-3xl border border-border/60 bg-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-bold">دور کمر نسبت به قد (WHtR)</p>
            <span className={cn('text-xs font-bold', TONE_TEXT[analysis.whtr.tone])}>{analysis.whtr.labelFa}</span>
          </div>
          <p className="tnum mt-2 text-2xl font-extrabold tracking-tight">
            {fmt2(analysis.whtr.ratio)}
            <span className="ms-2 text-[11px] font-medium text-muted-foreground">
              = {fmt(draft.measurements.waistCm ? Number(draft.measurements.waistCm) : 0)} ÷ {fmt(Number(draft.heightCm))}
            </span>
          </p>
          <div className="relative mt-3 h-1.5 rounded-full bg-muted" aria-hidden>
            <div
              className="absolute inset-y-0 start-0 rounded-full bg-primary"
              style={{ width: `${Math.min(100, (analysis.whtr.ratio / 0.7) * 100)}%` }}
            />
            <div className="absolute inset-y-[-3px] start-[71.4%] w-0.5 rounded bg-foreground/50" />
          </div>
          <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
            خط راهنما 0.5 — توصیه جهانی: دور کمر کمتر از نصف قد بماند.
          </p>
        </div>
      )}

      {analysis.whr && (
        <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-card px-4 py-3.5">
          <p className="text-[13px] font-medium text-muted-foreground">نسبت کمر به باسن (WHR)</p>
          <p className="tnum text-sm font-bold">
            {fmt2(analysis.whr.ratio)}
            <span className={cn('ms-2 text-[11px]', analysis.whr.high ? 'text-energy-strong' : 'text-brand-strong')}>
              {analysis.whr.labelFa}
            </span>
          </p>
        </div>
      )}

      {/* BMI — auxiliary only, per spec */}
      <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-card px-4 py-3.5">
        <p className="text-[13px] font-medium text-muted-foreground">شاخص توده بدنی (BMI) — فقط کمکی</p>
        <p className="tnum text-sm font-bold">
          {fmt1(analysis.bmi)}
          <span className={cn('ms-2 text-[11px]', TONE_TEXT[analysis.bmiTone])}>{analysis.bmiLabelFa}</span>
        </p>
      </div>

      {/* Healthy weight window + energy */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <p className="text-[11px] font-bold text-muted-foreground">محدوده وزن سالم تو</p>
          <p className="tnum mt-1.5 text-lg font-extrabold tracking-tight">
            {fmt(analysis.idealWeight.min)}–{fmt(analysis.idealWeight.max)}
            <span className="ms-1 text-[10px] font-medium text-muted-foreground">کیلوگرم</span>
          </p>
        </div>
        {analysis.katchBmr != null && (
          <div className="rounded-2xl border border-border/60 bg-card p-4">
            <p className="text-[11px] font-bold text-muted-foreground">سوخت‌وساز پایه (Katch-McArdle)</p>
            <p className="tnum mt-1.5 text-lg font-extrabold tracking-tight">
              {fmt(analysis.katchBmr)}
              <span className="ms-1 text-[10px] font-medium text-muted-foreground">kcal</span>
            </p>
          </div>
        )}
      </div>

      <p className="flex items-start gap-2 text-[11px] leading-5 text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        این اعداد با متر اندازه‌گیری خانگی تخمین زده می‌شوند (خطای حدود ±3–4٪) و جایگزین آزمایش DEXA یا نظر پزشک نیستند. BMI هم فقط یک شاخص کمکی است و به‌تنهایی ملاک تصمیم نیست.
      </p>
    </div>
  )
}
