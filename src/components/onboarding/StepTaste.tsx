'use client'

import type { StepProps } from '@/components/onboarding/StepAbout'
import { TextInputChips } from '@/components/onboarding/TextInputChips'

export function StepTaste({ draft, update }: StepProps) {
  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-[22px] font-bold leading-8">سلیقه‌ات را بگو</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          علاقه‌مندی‌ها بیشتر در برنامه ظاهر می‌شوند و از بدروفت‌ها دوری می‌کنیم.
        </p>
      </div>

      <div>
        <span className="mb-3 block text-sm font-medium">چه غذاهایی دوست داری؟</span>
        <TextInputChips
          values={draft.likedFoods}
          onChange={(likedFoods) => update({ likedFoods })}
          placeholder="مثلاً قورمه سبزی، عدسی…"
        />
      </div>

      <div>
        <span className="mb-3 block text-sm font-medium">چه غذاهایی دوست نداری؟</span>
        <TextInputChips
          values={draft.dislikedFoods}
          onChange={(dislikedFoods) => update({ dislikedFoods })}
          placeholder="مثلاً بادمجان، جگر…"
        />
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          تا جای ممکن از این‌ها در برنامه استفاده نمی‌شود.
        </p>
      </div>
    </div>
  )
}
