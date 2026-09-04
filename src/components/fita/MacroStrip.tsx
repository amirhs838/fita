import { cn } from '@/lib/utils'
import { enDigits } from '@/lib/phone'

function fmtInt(n: number): string {
  return enDigits(Math.round(n).toLocaleString('en-US'))
}

/**
 * Compact macro summary — one lightweight row, no cards.
 * Each macro gets a tone from the Marine palette (no rainbow):
 *   protein → interactive blue · carbs → energy orange ·
 *   fat → deep navy ink · fiber → soft blue
 */
const MACRO_TONES = [
  { fill: 'bg-primary', track: 'bg-brand-soft' },
  { fill: 'bg-energy', track: 'bg-energy-soft' },
  { fill: 'bg-foreground', track: 'bg-muted' },
  { fill: 'bg-primary/40', track: 'bg-brand-soft' },
] as const

export function MacroStrip({
  items,
  className,
}: {
  items: { label: string; value: number; target: number }[]
  className?: string
}) {
  return (
    <div className={cn('grid grid-cols-4 gap-3', className)}>
      {items.map((m, i) => {
        const pct = m.target > 0 ? Math.min(100, (m.value / m.target) * 100) : 0
        const tone = MACRO_TONES[i % MACRO_TONES.length]
        return (
          <div key={m.label}>
            <p className="text-[11px] text-muted-foreground">{m.label}</p>
            <p className="tnum mt-0.5 text-[13px] font-bold leading-5">
              {fmtInt(m.value)}
              <span className="font-normal text-muted-foreground"> / {fmtInt(m.target)}گ</span>
            </p>
            <div className={cn('mt-1.5 h-[3px] w-full overflow-hidden rounded-full', tone.track)}>
              <div
                className={cn('h-full rounded-full transition-[width] duration-700 ease-out', tone.fill)}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
