'use client'

import { useMemo } from 'react'
import type { OnboardingDraft } from '@/lib/onboarding-schema'
import type { StepProps } from '@/components/onboarding/StepAbout'
import { Input } from '@/components/ui/input'
import { OptionCard } from '@/components/onboarding/ChipSelect'
import { GOAL_HINT, GOAL_LABEL } from '@/lib/labels'
import { suggestTargetWeight, validateTargetWeight, type GoalType } from '@/lib/nutrition/engine'
import { enDigits } from '@/lib/phone'

const GOALS: GoalType[] = ['LOSE_WEIGHT', 'MAINTAIN', 'GAIN_WEIGHT', 'BUILD_MUSCLE', 'RECOMP']

export function StepGoal({ draft, update }: StepProps) {
  const needsTarget = draft.goalType === 'LOSE_WEIGHT' || draft.goalType === 'GAIN_WEIGHT'

  const currentWeight = Number(draft.currentWeightKg) || 0
  const targetNum = Number(draft.targetWeightKg) || 0

  const validation = useMemo(() => {
    if (!needsTarget && draft.goalType !== 'RECOMP' && draft.goalType !== 'BUILD_MUSCLE') return null
    if (!draft.goalType || !currentWeight || !targetNum) return null
    return validateTargetWeight({
      gender: draft.gender ?? 'MALE',
      heightCm: Number(draft.heightCm) || 170,
      currentWeightKg: currentWeight,
      targetWeightKg: targetNum,
      goalType: draft.goalType,
    })
  }, [draft.gender, draft.heightCm, draft.goalType, currentWeight, targetNum, needsTarget])

  const suggestion = draft.goalType && currentWeight ? suggestTargetWeight(currentWeight, draft.goalType) : null

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[22px] font-bold leading-8">هدفت چیست؟</h2>
        <p className="mt-1 text-sm text-muted-foreground">بعداً هم می‌توانی هدف را تغییر بدهی.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {GOALS.map((g) => (
          <OptionCard
            key={g}
            title={GOAL_LABEL[g]}
            hint={GOAL_HINT[g]}
            selected={draft.goalType === g}
            onClick={() => {
              update({ goalType: g, targetWeightKg: '' })
            }}
          />
        ))}
      </div>

      <div>
        <label htmlFor="ob-weight" className="mb-2 block text-sm font-medium">وزن فعلی (کیلوگرم)</label>
        <Input
          id="ob-weight"
          dir="ltr"
          inputMode="decimal"
          value={draft.currentWeightKg}
          onChange={(e) => update({ currentWeightKg: e.target.value.replace(/[^\d.]/g, '').slice(0, 6) })}
          placeholder="78.5"
          className="tnum h-13 rounded-2xl border-border/80 bg-card text-center"
        />
      </div>

      {draft.goalType === 'MAINTAIN' ? (
        <p className="rounded-xl bg-muted/60 px-4 py-3 text-[13px] leading-6 text-muted-foreground">
          هدف تو حفظ وزن فعلی است؛ کالری روزانه بر اساس آن تنظیم می‌شود.
        </p>
      ) : (
        <div>
          <label htmlFor="ob-target" className="mb-2 block text-sm font-medium">
            وزن هدف (کیلوگرم){!needsTarget && ' — اختیاری'}
          </label>
          <Input
            id="ob-target"
            dir="ltr"
            inputMode="decimal"
            value={draft.targetWeightKg}
            onChange={(e) => update({ targetWeightKg: e.target.value.replace(/[^\d.]/g, '').slice(0, 6) })}
            placeholder={draft.goalType === 'LOSE_WEIGHT' ? String(suggestion ?? 75) : '85'}
            className="tnum h-13 rounded-2xl border-border/80 bg-card text-center"
          />
          {suggestion && !draft.targetWeightKg && (
            <button
              type="button"
              onClick={() => update({ targetWeightKg: String(suggestion) })}
              className="tnum mt-2 text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              پیشنهاد فیتا: {enDigits(suggestion)} کیلوگرم — استفاده از پیشنهاد
            </button>
          )}
          {validation && !validation.ok && (
            <p className="mt-2 text-[13px] font-medium text-destructive">{validation.warnings[0]}</p>
          )}
          {validation?.ok && validation.warnings.length > 0 && (
            <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{validation.warnings[0]}</p>
          )}
        </div>
      )}
    </div>
  )
}
