import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-8 py-16 text-center', className)}>
      <div className="flex size-16 items-center justify-center rounded-full bg-brand-soft">
        <Icon className="size-7 text-brand-strong" aria-hidden />
      </div>
      <h2 className="mt-5 text-base font-bold">{title}</h2>
      <p className="mt-2 max-w-[26ch] text-sm leading-7 text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
