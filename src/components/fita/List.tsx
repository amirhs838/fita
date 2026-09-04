'use client'

import { cn } from '@/lib/utils'

/**
 * Apple-style grouped list: one calm white surface, hairline separators
 * between rows, no borders around the group.
 */
export function ListGroup({
  children,
  className,
  inset = true,
}: {
  children: React.ReactNode
  className?: string
  inset?: boolean
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl bg-card',
        inset ? 'shadow-[0_1px_3px_oklch(0.175_0_0/0.05)]' : 'border border-border/60',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function ListRow({
  icon: Icon,
  title,
  subtitle,
  value,
  onClick,
  accent = false,
  destructive = false,
  className,
  ariaLabel,
}: {
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number; 'aria-hidden'?: boolean }>
  title: string
  subtitle?: string
  value?: string
  onClick?: () => void
  /** Slightly stronger icon treatment (subscription etc.) */
  accent?: boolean
  destructive?: boolean
  className?: string
  ariaLabel?: string
}) {
  const body = (
    <>
      {Icon && (
        <span
          className={cn(
            'flex size-8.5 shrink-0 items-center justify-center rounded-full',
            accent
              ? 'bg-brand-soft text-brand-strong'
              : destructive
                ? 'bg-destructive/8 text-destructive'
                : 'bg-muted text-foreground/70',
          )}
        >
          <Icon className="size-4" strokeWidth={1.8} aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-sm',
            destructive ? 'font-medium text-destructive' : 'font-medium',
          )}
        >
          {title}
        </span>
        {subtitle && (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{subtitle}</span>
        )}
      </span>
      {value && <span className="tnum shrink-0 text-xs text-muted-foreground">{value}</span>}
      {onClick && (
        <svg
          viewBox="0 0 24 24"
          className="size-4 shrink-0 text-muted-foreground/50"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          {/* chevron pointing to the inline-end (RTL-aware) */}
          <path d="m9 6 6 6-6 6" />
        </svg>
      )}
    </>
  )

  const base = cn('flex w-full items-center gap-3 px-4 py-3 text-start', className)

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={ariaLabel ?? title} className={cn(base, 'cursor-pointer transition-colors hover:bg-muted/40')}>
        {body}
      </button>
    )
  }
  return (
    <div aria-disabled className={cn(base, 'opacity-90')}>
      {body}
    </div>
  )
}

/** Hairline separator for use between ListRows. */
export function ListSeparator() {
  return <div className="ms-[3.75rem] h-px bg-divider" role="separator" />
}
