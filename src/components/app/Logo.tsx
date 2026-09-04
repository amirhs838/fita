import { cn } from '@/lib/utils'

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex select-none items-baseline gap-0.5', className)}>
      <span className="font-black leading-none tracking-tight">فیتا</span>
      <span className="inline-block size-1.5 rounded-full bg-brand" aria-hidden />
    </span>
  )
}
