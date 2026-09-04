'use client'

import type { StepProps } from '@/components/onboarding/StepAbout'
import { OptionCard } from '@/components/onboarding/ChipSelect'
import { cn } from '@/lib/utils'
import { ACTIVITY_LABEL } from '@/lib/labels'
import type { ActivityLevel } from '@/lib/nutrition/engine'

const LEVELS: ActivityLevel[] = ['SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE']
const MEALS = [2, 3, 4, 5, 6]

const FA_MEALS: Record<number, string> = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6' }

export function StepActivity({ draft, update }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[22px] font-bold leading-8">چقدر فعال هستی؟</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          سطح فعالیت در کالری روزانه‌ات مستقیماً تأثیر دارد.
        </p>
      </div>

      <div className="space-y-2.5">
        {LEVELS.map((lvl) => (
          <button
            key={lvl}
            type="button"
            onClick={() => update({ activityLevel: lvl })}
            aria-pressed={draft.activityLevel === lvl}
            className={cn(
              'flex w-full items-center justify-between rounded-2xl border p-4 text-start transition-all active:scale-[0.99]',
              draft.activityLevel === lvl
                ? 'border-primary bg-brand-soft ring-1 ring-primary'
                : 'border-border hover:border-foreground/25',
            )}
          >
            <span>
              <span className="block text-sm font-medium">{ACTIVITY_LABEL[lvl].title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{ACTIVITY_LABEL[lvl].hint}</span>
            </span>
            <span
              className={cn(
                'size-5 shrink-0 rounded-full border-2',
                draft.activityLevel === lvl ? 'border-primary bg-primary' : 'border-border',
              )}
              aria-hidden
            />
          </button>
        ))}
      </div>

      <div>
        <span className="mb-2 block text-sm font-medium">چند وعده در روز غذا می‌خوری؟</span>
        <div className="flex gap-2">
          {MEALS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => update({ mealsPerDay: m })}
              aria-pressed={draft.mealsPerDay === m}
              className={cn(
                'tnum h-11 flex-1 rounded-xl border text-sm transition-all',
                draft.mealsPerDay === m
                  ? 'border-primary bg-primary font-bold text-primary-foreground'
                  : 'border-border hover:border-foreground/25',
              )}
            >
              {FA_MEALS[m]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
