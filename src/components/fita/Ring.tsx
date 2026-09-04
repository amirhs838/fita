import { cn } from '@/lib/utils'

/**
 * Thin single-ring progress indicator (calorie budget etc.).
 * Theme brand by default; understated by design — one glance, one number.
 */
export function Ring({
  progress,
  size = 148,
  strokeWidth = 7,
  className,
  track = 'var(--brand-soft)',
  children,
  label,
}: {
  /** 0..100 (clamped) */
  progress: number
  size?: number
  strokeWidth?: number
  className?: string
  /** CSS color for the track circle (arc uses currentColor via className) */
  track?: string
  children?: React.ReactNode
  label?: string
}) {
  const pct = Math.max(0, Math.min(100, progress))
  const r = (size - strokeWidth) / 2
  const c = 2 * Math.PI * r
  const dash = (pct / 100) * c

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={track}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          className="transition-[stroke-dasharray] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}
