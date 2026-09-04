import { cn } from '@/lib/utils'

/**
 * Editorial open section — the workhorse of the Fita layout.
 * No boxes: a quiet eyebrow row (title + optional trailing action) followed by
 * free-flowing children separated by whitespace/hairlines.
 */
export function Section({
  title,
  action,
  children,
  className,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-3', className)} aria-label={title}>
      <div className="flex min-h-7 items-center justify-between px-0.5">
        <h2 className="eyebrow">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
