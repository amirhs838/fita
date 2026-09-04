'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, ApiClientError } from '@/lib/client'
import { enDigits } from '@/lib/phone'
import { cn } from '@/lib/utils'
import type { AdminAiPutPayload, AdminAiSettingsData, AdminAiTestData } from '@/lib/types'

// ─────────────────────── Constants ───────────────────────

/** Quick-pick OpenRouter ids — one tap fills the model input. */
const MODEL_CHIPS: string[] = [
  'openai/gpt-4o-mini',
  'google/gemini-2.0-flash-001',
  'deepseek/deepseek-chat',
  'anthropic/claude-3.5-sonnet',
  'meta-llama/llama-3.3-70b-instruct',
]

const PROVIDER_BADGE: Record<
  AdminAiSettingsData['provider'],
  { label: string; className: string; hint: string }
> = {
  openrouter: {
    label: 'OpenRouter فعال',
    className: 'bg-brand-soft text-brand-strong',
    hint: 'تمام قابلیت‌های هوش مصنوعی با کلید و مدل OpenRouter کار می‌کنند.',
  },
  zai: {
    label: 'سرویس پیش‌فرض',
    className: 'bg-muted text-muted-foreground',
    hint: 'تا وقتی کلید OpenRouter ذخیره نشده، از سرویس پیش‌فرض سندباکس استفاده می‌شود.',
  },
  mock: {
    label: 'حالت آفلاین',
    className: 'bg-muted text-muted-foreground',
    hint: 'پاسخ‌های نمونه (AI_PROVIDER=mock) — برای توسعه رابط.',
  },
}

const KEY_SOURCE_LABEL: Record<AdminAiSettingsData['keySource'], string> = {
  db: 'ذخیره‌شده در پنل',
  env: 'تنظیم‌شده روی سرور (env)',
  none: 'بدون کلید',
}

// ─────────────────────── Panel ───────────────────────

export default function AiSettingsPanel() {
  const [data, setData] = useState<AdminAiSettingsData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [keyInput, setKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [textModel, setTextModel] = useState('')
  const [visionModel, setVisionModel] = useState('')

  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<AdminAiTestData | null>(null)

  const applyData = useCallback((d: AdminAiSettingsData) => {
    setData(d)
    setTextModel(d.dbTextModel || d.textModel)
    setVisionModel(d.dbVisionModel)
  }, [])

  useEffect(() => {
    let cancelled = false
    api<AdminAiSettingsData>('/api/admin/ai-settings')
      .then((d) => {
        if (!cancelled) applyData(d)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof ApiClientError ? err.message : 'بارگذاری تنظیمات ناموفق بود.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [applyData])

  const save = useCallback(
    async (extra?: AdminAiPutPayload) => {
      setSaving(true)
      try {
        const payload: AdminAiPutPayload = { ...extra }
        if (keyInput.trim()) payload.apiKey = keyInput.trim()
        payload.textModel = textModel.trim()
        payload.visionModel = visionModel.trim()
        const d = await api<AdminAiSettingsData>('/api/admin/ai-settings', {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        applyData(d)
        setKeyInput('')
        setTestResult(null)
        toast.success('تنظیمات هوش مصنوعی ذخیره شد.')
      } catch (err) {
        toast.error(err instanceof ApiClientError ? err.message : 'ذخیره ناموفق بود.')
      } finally {
        setSaving(false)
      }
    },
    [applyData, keyInput, textModel, visionModel],
  )

  const runTest = useCallback(async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await api<AdminAiTestData>('/api/admin/ai-settings/test', { method: 'POST' })
      setTestResult(result)
      toast.success('اتصال برقرار است.')
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'تست اتصال ناموفق بود.')
    } finally {
      setTesting(false)
    }
  }, [])

  if (loadError) {
    return (
      <div className="mt-6 rounded-3xl border border-border/70 bg-card p-5 text-sm text-muted-foreground">
        {loadError}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="mt-6 flex items-center justify-center rounded-3xl border border-border/70 bg-card p-10 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden />
      </div>
    )
  }

  const badge = PROVIDER_BADGE[data.provider]
  const canRemoveKey = data.hasKey && data.keySource === 'db'

  return (
    <div className="mt-6 space-y-4">
      {/* Current status */}
      <section
        aria-label="وضعیت فعلی هوش مصنوعی"
        className="rounded-3xl border border-border/70 bg-card p-5 shadow-[0_1px_3px_oklch(0.175_0_0/0.05)]"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-bold">وضعیت هوش مصنوعی</h2>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold',
              badge.className,
            )}
          >
            <CheckCircle2 className="size-3.5" aria-hidden />
            {badge.label}
          </span>
        </div>
        <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{badge.hint}</p>

        <dl className="mt-4 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2">
            <dt className="text-muted-foreground">کلید API</dt>
            <dd className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">{KEY_SOURCE_LABEL[data.keySource]}</span>
              <code dir="ltr" className="tnum rounded-md bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                {data.hasKey ? data.apiKeyMasked : '—'}
              </code>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2">
            <dt className="text-muted-foreground">مدل متن</dt>
            <dd>
              <code dir="ltr" className="rounded-md bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                {data.textModel}
              </code>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2">
            <dt className="text-muted-foreground">مدل تصویر</dt>
            <dd>
              <code dir="ltr" className="rounded-md bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                {data.visionModel}
              </code>
            </dd>
          </div>
        </dl>
      </section>

      {/* OpenRouter configuration */}
      <section
        aria-label="پیکربندی OpenRouter"
        className="rounded-3xl border border-border/70 bg-card p-5 shadow-[0_1px_3px_oklch(0.175_0_0/0.05)]"
      >
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-foreground">
            <Sparkles className="size-4.5 text-primary-foreground" strokeWidth={1.6} aria-hidden />
          </span>
          <div>
            <h2 className="text-[15px] font-bold leading-5">پیکربندی OpenRouter</h2>
            <p className="text-[11px] text-muted-foreground">کلید و اسم مدل را اینجا بارگذاری کن</p>
          </div>
        </div>

        {/* API key */}
        <div className="mt-5">
          <label htmlFor="ai-api-key" className="text-xs font-bold">
            کلید API
          </label>
          <div className="relative mt-1.5">
            <KeyRound
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="ai-api-key"
              type={showKey ? 'text' : 'password'}
              dir="ltr"
              autoComplete="off"
              placeholder={data.hasKey ? data.apiKeyMasked : 'sk-or-v1-…'}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              className="tnum pe-10 ps-9 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              aria-label={showKey ? 'پنهان کردن کلید' : 'نمایش کلید'}
              className="absolute end-2 top-1/2 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {showKey ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
            {data.hasKey
              ? 'کلید فعلی ذخیره است — برای تغییر، کلید تازه را وارد و ذخیره کن.'
              : 'از openrouter.ai/keys بگیر. فقط روی سرور ذخیره می‌شود و دوباره نمایش داده نمی‌شود.'}
          </p>
        </div>

        {/* Text model */}
        <div className="mt-4">
          <label htmlFor="ai-text-model" className="text-xs font-bold">
            اسم مدل متن
          </label>
          <Input
            id="ai-text-model"
            dir="ltr"
            autoComplete="off"
            placeholder="openai/gpt-4o-mini"
            value={textModel}
            onChange={(e) => setTextModel(e.target.value)}
            className="tnum mt-1.5 font-mono text-xs"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {MODEL_CHIPS.map((m) => (
              <button
                key={m}
                type="button"
                dir="ltr"
                onClick={() => setTextModel(m)}
                className={cn(
                  'cursor-pointer rounded-full border px-2.5 py-1 font-mono text-[10px] transition-colors',
                  textModel === m
                    ? 'border-primary bg-brand-soft text-brand-strong'
                    : 'border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Vision model */}
        <div className="mt-4">
          <label htmlFor="ai-vision-model" className="text-xs font-bold">
            اسم مدل تصویر <span className="font-normal text-muted-foreground">(اختیاری)</span>
          </label>
          <Input
            id="ai-vision-model"
            dir="ltr"
            autoComplete="off"
            placeholder="خالی = همان مدل متن"
            value={visionModel}
            onChange={(e) => setVisionModel(e.target.value)}
            className="tnum mt-1.5 font-mono text-xs"
          />
          <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
            برای شناسایی غذا از عکس استفاده می‌شود — مدلی با پشتیبانی تصویر انتخاب کن.
          </p>
        </div>

        {/* Actions */}
        <div className="mt-5 flex items-center gap-2">
          <Button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="h-10 flex-1 rounded-full text-[13px] font-bold"
          >
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
            {saving ? 'در حال ذخیره…' : 'ذخیره تنظیمات'}
          </Button>
          {canRemoveKey && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void save({ apiKey: '' })}
              disabled={saving}
              className="h-10 rounded-full px-3 text-xs font-bold text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden />
              حذف کلید
            </Button>
          )}
        </div>
      </section>

      {/* Connection test */}
      <section
        aria-label="تست اتصال"
        className="rounded-3xl border border-border/70 bg-card p-5 shadow-[0_1px_3px_oklch(0.175_0_0/0.05)]"
      >
        <h2 className="text-[15px] font-bold">تست اتصال</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          یک درخواست کوچک به OpenRouter با کلید و مدل متن فعلی می‌زند.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => void runTest()}
          disabled={testing || !data.hasKey}
          className="mt-3 h-10 w-full rounded-full text-[13px] font-bold"
        >
          {testing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Zap className="size-4" aria-hidden />}
          {testing ? 'در حال تست…' : 'تست اتصال به OpenRouter'}
        </Button>
        {!data.hasKey && (
          <p className="mt-2 text-[11px] text-muted-foreground">برای تست، اول کلید API را ذخیره کن.</p>
        )}
        {testResult && (
          <div className="tnum mt-3 rounded-2xl border border-border/70 bg-muted/40 p-3 text-xs">
            <p className="flex items-center gap-1.5 font-bold text-brand-strong">
              <CheckCircle2 className="size-4" aria-hidden />
              پاسخ مدل در {enDigits(testResult.latencyMs)} میلی‌ثانیه
            </p>
            <p dir="ltr" className="mt-1.5 font-mono text-[11px] text-muted-foreground">
              {testResult.model}
            </p>
            <p className="mt-1 leading-5">{testResult.reply}</p>
          </div>
        )}
      </section>
    </div>
  )
}
