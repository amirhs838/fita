'use client'

import { BookOpen, CalendarDays, Home, MessageCircle, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

export type TabId = 'home' | 'diary' | 'plan' | 'coach' | 'progress' | 'profile'

const TABS: { id: TabId; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'خانه', icon: Home },
  { id: 'diary', label: 'دفتر', icon: BookOpen },
  { id: 'plan', label: 'برنامه', icon: CalendarDays },
  { id: 'coach', label: 'مربی', icon: MessageCircle },
  { id: 'progress', label: 'پیشرفت', icon: TrendingUp },
]

interface BottomNavProps {
  active: TabId
  onChange: (tab: TabId) => void
}

/** Floating stadium dock — the palette's deep navy as a soft oval island.
 *  Active tab: white/10 pill + heavier icon stroke + bold label + orange dot.
 *  The wrapper (MainShell) provides side margins, safe-area and the fade. */
export function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav
      aria-label="ناوبری اصلی"
      className="relative grid grid-cols-5 rounded-full bg-foreground p-1.5 shadow-[0_18px_44px_-16px_oklch(0.15_0.05_240/0.5)]"
    >
      {TABS.map(({ id, label, icon: Icon }) => {
        const isActive = active === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex min-h-[54px] cursor-pointer flex-col items-center justify-center gap-1 rounded-full px-1 pt-2 pb-1.5 transition-colors duration-200',
              isActive
                ? 'bg-white/10 text-white'
                : 'text-white/55 hover:bg-white/5 hover:text-white/85',
            )}
          >
            <Icon
              className="size-[22px]"
              strokeWidth={isActive ? 2.2 : 1.7}
              aria-hidden
            />
            <span className={cn('text-[11px] leading-3', isActive ? 'font-bold' : 'font-medium')}>
              {label}
            </span>
            <span
              className={cn(
                'size-1 rounded-full transition-all duration-200',
                isActive ? 'bg-energy' : 'bg-transparent',
              )}
              aria-hidden
            />
          </button>
        )
      })}
    </nav>
  )
}
