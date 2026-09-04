'use client'

import type { StepProps } from '@/components/onboarding/StepAbout'
import { OptionCard } from '@/components/onboarding/ChipSelect'
import { BUDGET_LABEL } from '@/lib/labels'
import type { BudgetLevel } from '@/lib/nutrition/engine'

const LEVELS: BudgetLevel[] = ['ECONOMY', 'MID', 'FLEXIBLE']

export function StepBudget({ draft, update }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[22px] font-bold leading-8">بودجه غذایی‌ات؟</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          برنامه غذایی بر اساس این سطح پیشنهاد می‌شود؛ از قیمت دقیق خبری نیست.
        </p>
      </div>

      <div className="space-y-2.5">
        {LEVELS.map((lvl) => (
          <OptionCard
            key={lvl}
            title={BUDGET_LABEL[lvl].title}
            hint={BUDGET_LABEL[lvl].hint}
            selected={draft.budgetLevel === lvl}
            onClick={() => update({ budgetLevel: lvl })}
          />
        ))}
      </div>
    </div>
  )
}
