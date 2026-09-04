'use client'

import { useEffect, useState } from 'react'
import { Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { enDigits } from '@/lib/phone'

/**
 * Elegant count-up for dominant metrics (reduced-motion aware).
 * Renders `value` directly until an animation frame sets an interpolated one.
 */
export function AnimatedNumber({
  value,
  className,
  duration = 600,
}: {
  value: number
  className?: string
  duration?: number
}) {
  // null → show `value` as-is (also covers reduced-motion & first paint)
  const [display, setDisplay] = useState<number | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const start = performance.now()
    let raf = 0
    let last = value
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      last = Math.round(value * eased + value * 0) // anchor
      setDisplay(last)
      if (p < 1) raf = requestAnimationFrame(tick)
      else setDisplay(null) // settle on the real value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  return <span className={cn('tnum', className)}>{enDigits(display ?? value)}</span>
}

/** Soft skeleton block for loading states. */
export function SkeletonBlock({ className }: { className?: string }) {
  return <Skeleton className={cn('rounded-2xl', className)} />
}

/** Calm error state with retry — no red alarm, just clarity. */
export function ErrorState({
  title = 'بارگذاری نشد',
  description = 'اتصال اینترنت را بررسی کن.',
  onRetry,
  retrying = false,
}: {
  title?: string
  description?: string
  onRetry: () => void
  retrying?: boolean
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <RotateCcw className="size-5 text-muted-foreground" strokeWidth={1.8} aria-hidden />
      </span>
      <p className="mt-4 text-sm font-bold">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      <Button
        variant="outline"
        size="sm"
        className="mt-5 h-10 rounded-full px-6"
        onClick={onRetry}
        disabled={retrying}
      >
        {retrying && <Loader2 className="size-4 animate-spin" aria-hidden />}
        تلاش مجدد
      </Button>
    </div>
  )
}
