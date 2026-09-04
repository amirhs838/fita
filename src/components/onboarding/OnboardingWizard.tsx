'use client'

import { useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api, ApiClientError } from '@/lib/client'
import { draftToInput, emptyDraft, type OnboardingDraft } from '@/lib/onboarding-schema'
import { todayIso } from '@/lib/date'
import { enDigits } from '@/lib/phone'
import { validateTargetWeight, type GoalType } from '@/lib/nutrition/engine'
import { Logo } from '@/components/app/Logo'
import { StepAbout } from '@/components/onboarding/StepAbout'
import { StepGoal } from '@/components/onboarding/StepGoal'
import { StepActivity } from '@/components/onboarding/StepActivity'
import { StepDiet } from '@/components/onboarding/StepDiet'
import { StepTaste } from '@/components/onboarding/StepTaste'
import { StepBudget } from '@/components/onboarding/StepBudget'
import { StepSpecial } from '@/components/onboarding/StepSpecial'
import { StepResults } from '@/components/onboarding/StepResults'

const TOTAL_STEPS = 8

function validateStep(step: number, draft: OnboardingDraft): string | null {
  switch (step) {
    case 0: {
      if (draft.name.trim().length < 2) return 'نام را کامل وارد کن.'
      if (!draft.gender) return 'جنسیت را انتخاب کن.'
      const age = Number(draft.age)
      if (!Number.isFinite(age) || age < 13 || age > 90) return 'سن باید بین 13 تا 90 باشد.'
      const h = Number(draft.heightCm)
      if (!Number.isFinite(h) || h < 100 || h > 230) return 'قد را درست وارد کن (سانتی‌متر).'
      return null
    }
    case 1: {
      if (!draft.goalType) return 'هدف را انتخاب کن.'
      const w = Number(draft.currentWeightKg)
      if (!Number.isFinite(w) || w < 35 || w > 250) return 'وزن فعلی را درست وارد کن (کیلوگرم).'
      const needsTarget = draft.goalType === 'LOSE_WEIGHT' || draft.goalType === 'GAIN_WEIGHT'
      if (needsTarget || draft.targetWeightKg.trim()) {
        const t = Number(draft.targetWeightKg)
        if (!Number.isFinite(t) || t < 30 || t > 300) return 'وزن هدف را درست وارد کن.'
        const check = validateTargetWeight({
          gender: draft.gender ?? 'MALE',
          heightCm: Number(draft.heightCm) || 170,
          currentWeightKg: w,
          targetWeightKg: t,
          goalType: draft.goalType as GoalType,
        })
        if (!check.ok) return check.warnings[0]
      }
      return null
    }
    case 2:
      return draft.activityLevel ? null : 'سطح فعالیت را انتخاب کن.'
    case 3:
    case 4:
      return null
    case 5:
      return draft.budgetLevel ? null : 'سطح بودجه را انتخاب کن.'
    default:
      return null
  }
}

export function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const [draft, setDraft] = useState<OnboardingDraft>(emptyDraft)
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const update = (patch: Partial<OnboardingDraft>) => setDraft((d) => ({ ...d, ...patch }))

  function next() {
    const err = validateStep(step, draft)
    if (err) {
      setError(err)
      return
    }
    setError('')
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1))
  }

  function back() {
    setError('')
    setStep((s) => Math.max(s - 1, 0))
  }

  async function submit() {
    setError('')
    setSubmitting(true)
    try {
      const payload = draftToInput(draft, todayIso())
      await api('/api/profile/onboarding', { method: 'POST', body: JSON.stringify(payload) })
      onComplete()
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'ذخیره اطلاعات ناموفق بود. دوباره تلاش کن.',
      )
      setSubmitting(false)
    }
  }

  const steps = [
    <StepAbout key="about" draft={draft} update={update} />,
    <StepGoal key="goal" draft={draft} update={update} />,
    <StepActivity key="activity" draft={draft} update={update} />,
    <StepDiet key="diet" draft={draft} update={update} />,
    <StepTaste key="taste" draft={draft} update={update} />,
    <StepBudget key="budget" draft={draft} update={update} />,
    <StepSpecial key="special" draft={draft} update={update} />,
    <StepResults key="results" draft={draft} update={update} />,
  ]
  const isLast = step === TOTAL_STEPS - 1

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background sm:border-x">
      <header className="sticky top-0 z-20 bg-background/85 backdrop-blur-xl">
        <div className="flex h-14 items-center gap-3 px-5">
          {step > 0 ? (
            <button
              type="button"
              onClick={back}
              aria-label="مرحله قبل"
              className="flex size-9 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-muted"
            >
              <ArrowRight className="size-5" aria-hidden />
            </button>
          ) : (
            <Logo className="text-lg" />
          )}
          <span className="tnum text-xs text-muted-foreground">
            مرحله {enDigits(step + 1)} از {enDigits(TOTAL_STEPS)}
          </span>
        </div>
        {/* hairline progress */}
        <div className="h-[3px] w-full bg-muted">
          <div
            className="h-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
            role="progressbar"
            aria-valuenow={step + 1}
            aria-valuemin={1}
            aria-valuemax={TOTAL_STEPS}
          />
        </div>
      </header>

      <main key={step} className="flex-1 px-6 pb-32 pt-7 animate-in fade-in-50 duration-200">
        {steps[step]}
        {error && <p className="mt-5 text-[13px] font-medium text-destructive">{error}</p>}
      </main>

      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-background via-background to-transparent pb-safe pt-3">
        <div className="mx-auto max-w-md px-6 pb-2">
          <Button
            onClick={() => (isLast ? void submit() : next())}
            disabled={submitting}
            size="lg"
            className="w-full rounded-full font-bold"
          >
            {submitting && <Loader2 className="animate-spin" aria-hidden />}
            {isLast ? 'شروع کن' : 'ادامه'}
          </Button>
        </div>
      </div>
    </div>
  )
}
