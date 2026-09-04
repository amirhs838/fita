'use client'

import { useState } from 'react'
import type { StepProps } from '@/components/onboarding/StepAbout'
import { ChipSelect } from '@/components/onboarding/ChipSelect'
import { DIET_TAG_LABEL } from '@/lib/labels'
import type { DietTag } from '@/lib/nutrition/engine'

const DIET_TAGS = Object.keys(DIET_TAG_LABEL) as DietTag[]

const ALLERGY_PRESETS = [
  'تخم مرغ',
  'شیر و لبنیات',
  'آجیل و خشکبار',
  'بادام زمینی',
  'گلوتن و گندم',
  'سویا',
  'ماهی',
  'میگو',
  'توت فرنگی',
  'شکلات',
]

export function StepDiet({ draft, update }: StepProps) {
  const [customAllergy, setCustomAllergy] = useState('')

  function toggleAllergy(name: string) {
    update({
      allergies: draft.allergies.includes(name)
        ? draft.allergies.filter((a) => a !== name)
        : [...draft.allergies, name],
    })
  }

  function addCustomAllergy() {
    const v = customAllergy.trim().replace(/\s+/g, ' ')
    if (v.length < 2 || draft.allergies.includes(v) || draft.allergies.length >= 12) {
      setCustomAllergy('')
      return
    }
    update({ allergies: [...draft.allergies, v] })
    setCustomAllergy('')
  }

  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-[22px] font-bold leading-8">ترجیحات و حساسیت‌ها</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          هر دو مورد اختیاری‌اند؛ ولی به فیتا کمک می‌کنند برنامه دقیق‌تری بسازد.
        </p>
      </div>

      <div>
        <span className="mb-1 block text-sm font-medium">سبک غذایی</span>
        <p className="mb-3 text-xs leading-5 text-muted-foreground">
          «عادی» یعنی بدون محدودیت خاص — انتخاب آن سایر سبک‌ها را پاک می‌کند.
        </p>
        <div className="flex flex-wrap gap-2">
          {DIET_TAGS.map((tag) => (
            <ChipSelect
              key={tag}
              label={DIET_TAG_LABEL[tag]}
              selected={draft.dietPreferences.includes(tag)}
              onClick={() => {
                const has = draft.dietPreferences.includes(tag)
                if (tag === 'NORMAL') {
                  // NORMAL is exclusive — choosing it clears every restrictive style.
                  update({ dietPreferences: has ? [] : ['NORMAL'] })
                  return
                }
                const next = has
                  ? draft.dietPreferences.filter((t) => t !== tag)
                  : [...draft.dietPreferences.filter((t) => t !== 'NORMAL'), tag]
                update({ dietPreferences: next })
              }}
              size="sm"
            />
          ))}
        </div>
      </div>

      <div>
        <span className="mb-1 block text-sm font-medium">حساسیت غذایی</span>
        <p className="mb-3 text-xs leading-5 text-muted-foreground">
          غذاهای انتخاب‌شده هرگز در برنامه‌هایت پیشنهاد نمی‌شوند.
        </p>
        <div className="flex flex-wrap gap-2">
          {ALLERGY_PRESETS.map((a) => (
            <ChipSelect
              key={a}
              label={a}
              selected={draft.allergies.includes(a)}
              onClick={() => toggleAllergy(a)}
              size="sm"
            />
          ))}
        </div>
        {draft.allergies.some((a) => !ALLERGY_PRESETS.includes(a)) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {draft.allergies
              .filter((a) => !ALLERGY_PRESETS.includes(a))
              .map((a) => (
                <ChipSelect key={a} label={a} selected onClick={() => toggleAllergy(a)} size="sm" />
              ))}
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <input
            value={customAllergy}
            onChange={(e) => setCustomAllergy(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustomAllergy()
              }
            }}
            placeholder="حساسیت دیگری دارید؟ بنویسید…"
            maxLength={40}
            className="h-10 w-full rounded-xl border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="button"
            onClick={addCustomAllergy}
            className="shrink-0 rounded-xl border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
          >
            افزودن
          </button>
        </div>
      </div>
    </div>
  )
}
