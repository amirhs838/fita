'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { api } from '@/lib/client'
import type { MeData } from '@/lib/types'

type FieldKey = 'heightCm' | 'weightKg' | 'waistCm' | 'armCm' | 'neckCm' | 'hipCm'

interface FieldSpec {
  key: FieldKey
  label: string
  unit: string
  placeholder: string
  min: number
  max: number
}

const MAIN_FIELDS: FieldSpec[] = [
  { key: 'heightCm', label: 'قد', unit: 'سانتی‌متر', placeholder: 'مثلاً 178', min: 100, max: 230 },
  { key: 'weightKg', label: 'وزن', unit: 'کیلوگرم', placeholder: 'مثلاً 76', min: 35, max: 250 },
]

const CIRC_FIELDS: FieldSpec[] = [
  { key: 'waistCm', label: 'دور کمر', unit: 'سانتی‌متر', placeholder: 'مثلاً 88', min: 40, max: 200 },
  { key: 'armCm', label: 'دور بازو', unit: 'سانتی‌متر', placeholder: 'مثلاً 32', min: 15, max: 70 },
  { key: 'neckCm', label: 'دور گردن', unit: 'سانتی‌متر', placeholder: 'مثلاً 38', min: 20, max: 60 },
  { key: 'hipCm', label: 'دور باسن', unit: 'سانتی‌متر', placeholder: 'مثلاً 98', min: 50, max: 200 },
]

function UnitInput({
  spec,
  value,
  onChange,
}: {
  spec: FieldSpec
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{spec.label}</span>
      <span className="relative block">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          placeholder={spec.placeholder}
          aria-label={`${spec.label} — ${spec.unit}`}
          className="h-12 rounded-2xl pe-16 text-start text-[15px] font-bold"
        />
        <span className="pointer-events-none absolute inset-y-0 end-3.5 flex items-center text-[10px] text-muted-foreground">
          {spec.unit}
        </span>
      </span>
    </label>
  )
}

interface BodyInfoSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  me: MeData
  /** Called after a successful save (parent reloads /api/me). */
  onSaved: () => void
}

/**
 * Body-profile editor — height/weight plus optional tape circumferences.
 * Weight writes today's weigh-in (same contract as POST /api/weight); tape
 * fields merge into today's BodyMeasurement row; body-fat % is never stored —
 * it is re-estimated server-side from the tape (Navy → RFM).
 */
export function BodyInfoSheet({ open, onOpenChange, me, onSaved }: BodyInfoSheetProps) {
  const [values, setValues] = useState<Record<FieldKey, string>>({
    heightCm: '',
    weightKg: '',
    waistCm: '',
    armCm: '',
    neckCm: '',
    hipCm: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const b = me.body
    setValues({
      heightCm: b?.heightCm != null ? String(Math.round(b.heightCm)) : '',
      weightKg: b?.currentWeightKg != null ? String(Math.round(b.currentWeightKg * 10) / 10) : '',
      waistCm: b?.waistCm != null ? String(Math.round(b.waistCm)) : '',
      armCm: b?.armCm != null ? String(Math.round(b.armCm)) : '',
      neckCm: b?.neckCm != null ? String(Math.round(b.neckCm)) : '',
      hipCm: b?.hipCm != null ? String(Math.round(b.hipCm)) : '',
    })
  }, [open, me.body])

  function setField(key: FieldKey, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }))
  }

  async function save() {
    const payload: Record<string, number> = {}
    for (const spec of [...MAIN_FIELDS, ...CIRC_FIELDS]) {
      const raw = values[spec.key].trim()
      if (!raw) continue
      const n = Number(raw.replace(/[^\d.]/g, ''))
      if (!Number.isFinite(n) || n < spec.min || n > spec.max) {
        toast.error(`${spec.label} باید بین ${spec.min} تا ${spec.max} باشد.`)
        return
      }
      payload[spec.key] = n
    }
    if (Object.keys(payload).length === 0) {
      toast.error('حداقل یک مقدار را وارد کن.')
      return
    }

    setSaving(true)
    try {
      await api('/api/profile/body', { method: 'POST', body: JSON.stringify(payload) })
      toast.success('اطلاعات بدنی به‌روز شد')
      onOpenChange(false)
      onSaved()
    } catch {
      toast.error('ذخیره انجام نشد — دوباره تلاش کن.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-[28px] px-6 pb-8 pt-3 sm:max-w-md sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2"
      >
        <SheetHeader className="px-1 text-start">
          <SheetTitle className="text-lg font-bold">اطلاعات بدنی</SheetTitle>
          <SheetDescription className="text-[13px]">
            قد، وزن و دور اندام‌ها را به‌روز نگه دار تا محاسبات کالری دقیق بماند.
          </SheetDescription>
        </SheetHeader>

        <div className="scroll-thin mt-4 max-h-[52vh] space-y-5 overflow-y-auto px-1 pb-1">
          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="sr-only">اندازه‌های اصلی</legend>
            {MAIN_FIELDS.map((spec) => (
              <UnitInput key={spec.key} spec={spec} value={values[spec.key]} onChange={(v) => setField(spec.key, v)} />
            ))}
          </fieldset>

          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="mb-1 text-xs font-bold">دور اندام‌ها — اختیاری</legend>
            {CIRC_FIELDS.map((spec) => (
              <UnitInput key={spec.key} spec={spec} value={values[spec.key]} onChange={(v) => setField(spec.key, v)} />
            ))}
          </fieldset>

          <p className="text-[11px] leading-5 text-muted-foreground">
            دور کمر و گردن (و باسن برای خانم‌ها) برای تخمین هوشمند چربی بدن استفاده می‌شود؛ این تخمین در نمودار
            «چربی بدن» بخش پیشرفت نمایش داده می‌شود.
          </p>
        </div>

        <Button
          onClick={() => void save()}
          disabled={saving}
          className="mt-4 h-12 w-full rounded-full text-base font-bold"
        >
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
          ذخیره
        </Button>
      </SheetContent>
    </Sheet>
  )
}
