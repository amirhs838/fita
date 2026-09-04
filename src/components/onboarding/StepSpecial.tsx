'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import type { StepProps } from '@/components/onboarding/StepAbout'
import { Input } from '@/components/ui/input'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

const MEASURE_FIELDS: { key: keyof StepProps['draft']['measurements']; label: string; placeholder: string }[] = [
  { key: 'waistCm', label: 'دور کمر', placeholder: '95' },
  { key: 'hipCm', label: 'دور باسن', placeholder: '105' },
  { key: 'neckCm', label: 'دور گردن', placeholder: '38' },
  { key: 'armCm', label: 'دور بازو', placeholder: '32' },
  { key: 'thighCm', label: 'دور ران', placeholder: '58' },
  { key: 'wristCm', label: 'دور مچ', placeholder: '16' },
]

export function StepSpecial({ draft, update }: StepProps) {
  const [open, setOpen] = useState(false)
  const isFemale = draft.gender === 'FEMALE'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[22px] font-bold leading-8">وضعیت خاص و اندازه‌ها</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          همه موارد این مرحله اختیاری‌اند؛ اگر اندازه‌ها را وارد کنی، مرحله بعد تحلیل دقیق بدنت را نشان می‌دهد.
        </p>
      </div>

      {isFemale && (
        <div className="space-y-3">
          <label className="flex items-center justify-between rounded-2xl border border-border p-4">
            <span className="text-sm font-medium">باردار هستم</span>
            <input
              type="checkbox"
              checked={draft.pregnancy}
              onChange={(e) => update({ pregnancy: e.target.checked })}
              className="size-5 accent-primary"
            />
          </label>
          <label className="flex items-center justify-between rounded-2xl border border-border p-4">
            <span className="text-sm font-medium">شیرده هستم</span>
            <input
              type="checkbox"
              checked={draft.breastfeeding}
              onChange={(e) => update({ breastfeeding: e.target.checked })}
              className="size-5 accent-primary"
            />
          </label>
          {(draft.pregnancy || draft.breastfeeding) && (
            <p className="rounded-xl bg-muted/60 px-4 py-3 text-[13px] leading-6 text-muted-foreground">
              در این شرایط توصیه‌های فیتا محافظه‌کارانه خواهد بود و جایگزین نظر پزشک نیست.
            </p>
          )}
        </div>
      )}

      <div>
        <label htmlFor="ob-meds" className="mb-2 block text-sm font-medium">داروهای مصرفی (اختیاری)</label>
        <Input
          id="ob-meds"
          value={draft.medications}
          onChange={(e) => update({ medications: e.target.value })}
          placeholder="مثلاً لیووتیروکسین"
          maxLength={300}
          className="h-12 rounded-xl"
        />
      </div>

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-2xl border border-border p-4 transition-colors hover:bg-muted/40">
          <span className="text-sm font-medium">اندازه‌های بدن (اختیاری)</span>
          {open ? (
            <ChevronUp className="size-4 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid grid-cols-2 gap-3 pt-4">
            {MEASURE_FIELDS.map(({ key, label, placeholder }) => (
              <div key={key}>
                <label htmlFor={`ob-${key}`} className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  {label} (سانتی‌متر)
                </label>
                <Input
                  id={`ob-${key}`}
                  dir="ltr"
                  inputMode="decimal"
                  value={draft.measurements[key]}
                  onChange={(e) =>
                    update({
                      measurements: { ...draft.measurements, [key]: e.target.value.replace(/[^\d.]/g, '').slice(0, 5) },
                    })
                  }
                  placeholder={placeholder}
                  className="tnum h-11 rounded-xl text-center"
                />
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
