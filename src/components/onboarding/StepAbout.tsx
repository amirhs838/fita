'use client'

import type { OnboardingDraft } from '@/lib/onboarding-schema'
import { Input } from '@/components/ui/input'
import { OptionCard } from '@/components/onboarding/ChipSelect'
import type { Gender } from '@/lib/nutrition/engine'

export interface StepProps {
  draft: OnboardingDraft
  update: (patch: Partial<OnboardingDraft>) => void
}

export function StepAbout({ draft, update }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[22px] font-bold leading-8">خوش آمدی! خودت را معرفی کن</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          این اطلاعات برای محاسبه دقیق اهداف روزانه لازم است.
        </p>
      </div>

      <div>
        <label htmlFor="ob-name" className="mb-2 block text-sm font-medium">نام</label>
        <Input
          id="ob-name"
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="مثلاً سارا محمدی"
          maxLength={60}
          className="h-13 rounded-2xl border-border/80 bg-card"
        />
      </div>

      <div>
        <span className="mb-2 block text-sm font-medium">جنسیت</span>
        <div className="grid grid-cols-2 gap-3">
          <OptionCard title="زن" selected={draft.gender === 'FEMALE'} onClick={() => update({ gender: 'FEMALE' as Gender })} />
          <OptionCard title="مرد" selected={draft.gender === 'MALE'} onClick={() => update({ gender: 'MALE' as Gender })} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="ob-age" className="mb-2 block text-sm font-medium">سن</label>
          <Input
            id="ob-age"
            dir="ltr"
            inputMode="numeric"
            value={draft.age}
            onChange={(e) => update({ age: e.target.value.replace(/\D/g, '').slice(0, 2) })}
            placeholder="28"
            className="tnum h-13 rounded-2xl border-border/80 bg-card text-center"
          />
        </div>
        <div>
          <label htmlFor="ob-height" className="mb-2 block text-sm font-medium">قد (سانتی‌متر)</label>
          <Input
            id="ob-height"
            dir="ltr"
            inputMode="numeric"
            value={draft.heightCm}
            onChange={(e) => update({ heightCm: e.target.value.replace(/[^\d]/g, '').slice(0, 3) })}
            placeholder="170"
            className="tnum h-13 rounded-2xl border-border/80 bg-card text-center"
          />
        </div>
      </div>
    </div>
  )
}
