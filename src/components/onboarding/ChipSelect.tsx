'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChipSelectProps {
  label: string
  selected: boolean
  onClick: () => void
  size?: 'sm' | 'md'
}

export function ChipSelect({ label, selected, onClick, size = 'md' }: ChipSelectProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-transparent transition-all active:scale-[0.97]',
        size === 'md' ? 'px-4 py-2.5 text-sm' : 'px-3 py-1.5 text-[13px]',
        selected
          ? 'border-primary bg-brand-soft font-bold text-brand-strong'
          : 'bg-muted/70 text-foreground/80 hover:bg-muted',
      )}
    >
      {selected && <Check className="size-3.5" aria-hidden />}
      {label}
    </button>
  )
}

interface OptionCardProps {
  title: string
  hint?: string
  selected: boolean
  onClick: () => void
}

export function OptionCard({ title, hint, selected, onClick }: OptionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'cursor-pointer rounded-2xl border p-4 text-start transition-all active:scale-[0.98]',
        selected
          ? 'border-primary bg-brand-soft'
          : 'border-border/80 hover:border-foreground/25 hover:bg-muted/20',
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className={cn('block text-sm', selected ? 'font-bold' : 'font-medium')}>{title}</span>
        {selected && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
      </span>
      {hint && <span className="mt-1 block text-xs leading-5 text-muted-foreground">{hint}</span>}
    </button>
  )
}
