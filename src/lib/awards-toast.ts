import { toast } from 'sonner'
import { enDigits } from '@/lib/phone'
import type { AchievementDto } from '@/lib/types'

/** Shared award toast — used by every gamification hook response. */
export function toastAwards(awards?: AchievementDto[] | null): void {
  for (const a of awards ?? []) {
    toast.success(`نشان جدید: ${a.icon ?? '🏅'} ${a.titleFa}`, {
      description: `${a.descriptionFa} · +${enDigits(a.xp)} امتیاز`,
      duration: 5000,
    })
  }
}
