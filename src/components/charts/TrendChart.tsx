'use client'

import { useId, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface TrendPointDto {
  date: string
  value: number
}

type Tone = 'brand' | 'ink' | 'energy'

const TONE_COLOR: Record<Tone, string> = {
  brand: 'var(--brand)',
  ink: 'var(--foreground)',
  energy: 'var(--energy)',
}

// Logical viewBox — the SVG scales fluidly; the bubble overlays by percentage.
const W = 340
const H = 170
const PAD_X = 12
const PAD_TOP = 16
const PAD_BOTTOM = 24
const PLOT_H = H - PAD_TOP - PAD_BOTTOM

/**
 * Monotone cubic interpolation (Fritsch–Carlson) — smooth curves that never
 * overshoot the data (unlike Catmull-Rom), so trends stay honest.
 */
function monotonePath(pts: { x: number; y: number }[]): string {
  const n = pts.length
  if (n < 2) return ''
  const dx: number[] = []
  const slope: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const dxi = Math.max(pts[i + 1].x - pts[i].x, 0.0001)
    dx.push(dxi)
    slope.push((pts[i + 1].y - pts[i].y) / dxi)
  }
  const m: number[] = new Array(n)
  m[0] = slope[0]
  m[n - 1] = slope[n - 2]
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) {
      m[i] = 0
    } else {
      m[i] =
        (3 * (slope[i - 1] + slope[i])) /
          ((2 * slope[i] + slope[i - 1]) / slope[i - 1] + (slope[i] + 2 * slope[i - 1]) / slope[i])
    }
  }
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`
  for (let i = 0; i < n - 1; i++) {
    const cx1 = pts[i].x + dx[i] / 3
    const cy1 = pts[i].y + (m[i] * dx[i]) / 3
    const cx2 = pts[i + 1].x - dx[i] / 3
    const cy2 = pts[i + 1].y - (m[i + 1] * dx[i]) / 3
    d += ` C ${cx1.toFixed(2)} ${cy1.toFixed(2)}, ${cx2.toFixed(2)} ${cy2.toFixed(2)}, ${pts[i + 1].x.toFixed(2)} ${pts[i + 1].y.toFixed(2)}`
  }
  return d
}

export interface TrendChartProps {
  points: TrendPointDto[]
  mode?: 'line' | 'bar'
  tone?: Tone
  /** Reference line (goal weight / daily kcal target). */
  target?: number | null
  targetLabel?: string
  unit: string
  formatValue: (v: number) => string
  formatDate: (iso: string) => string
  ariaLabel: string
  className?: string
}

/**
 * Fita trend chart — minimal Marine-system SVG:
 * thin monotone line with a soft gradient wash (or quiet bars), hairline
 * grid, dashed target reference, touch-scrub bubble, and a one-shot draw-in
 * animation. Time flows left→right; x positions are true to the dates.
 */
export function TrendChart({
  points,
  mode = 'line',
  tone = 'brand',
  target = null,
  targetLabel = 'هدف',
  unit,
  formatValue,
  formatDate,
  ariaLabel,
  className,
}: TrendChartProps) {
  const color = TONE_COLOR[tone]
  const gradId = useId()
  const svgRef = useRef<SVGSVGElement>(null)
  const [active, setActive] = useState<number | null>(null)

  const geom = useMemo(() => {
    if (points.length === 0) return null
    const times = points.map((p) => new Date(`${p.date}T12:00:00`).getTime())
    const t0 = times[0]
    const t1 = times[times.length - 1]
    const xOf = (t: number) =>
      PAD_X + ((t - t0) / Math.max(t1 - t0, 1)) * (W - PAD_X * 2)

    let minV: number
    let maxV: number
    if (mode === 'bar') {
      minV = 0
      maxV = Math.max(...points.map((p) => p.value), target ?? 0) * 1.08
      if (maxV <= 0) maxV = 1
    } else {
      const vals = points.map((p) => p.value)
      if (target != null) vals.push(target)
      minV = Math.min(...vals)
      maxV = Math.max(...vals)
      if (minV === maxV) {
        minV -= Math.abs(minV) * 0.06 || 1
        maxV += Math.abs(maxV) * 0.06 || 1
      }
      const padY = (maxV - minV) * 0.14
      minV -= padY
      maxV += padY
    }
    const yOf = (v: number) => PAD_TOP + ((maxV - v) / (maxV - minV)) * PLOT_H

    const pts = points.map((p, i) => ({ x: xOf(times[i]), y: yOf(p.value) }))
    const baseY = mode === 'bar' ? H - PAD_BOTTOM : PAD_TOP + PLOT_H
    return { xOf, yOf, pts, baseY, minV, maxV }
  }, [points, mode, target])

  const linePath = useMemo(() => {
    if (!geom || geom.pts.length < 2) return ''
    return monotonePath(geom.pts)
  }, [geom])

  const areaPath = useMemo(() => {
    if (!geom || geom.pts.length < 2 || !linePath) return ''
    const first = geom.pts[0]
    const last = geom.pts[geom.pts.length - 1]
    return `${linePath} L ${last.x.toFixed(2)} ${geom.baseY} L ${first.x.toFixed(2)} ${geom.baseY} Z`
  }, [geom, linePath])

  const barGeom = useMemo(() => {
    if (!geom || mode !== 'bar') return null
    const step = (W - PAD_X * 2) / Math.max(points.length, 1)
    const barW = Math.min(10, Math.max(3, step * 0.52))
    return { barW }
  }, [geom, mode, points.length])

  function locate(e: React.PointerEvent<SVGRectElement>) {
    const svg = svgRef.current
    if (!svg || points.length === 0 || !geom) return
    const rect = svg.getBoundingClientRect()
    const vx = ((e.clientX - rect.left) / rect.width) * W
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < geom.pts.length; i++) {
      const d = Math.abs(geom.pts[i].x - vx)
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    setActive(best)
  }

  const n = points.length
  const showDots = mode === 'line' && n <= 36
  const lastPoint = geom?.pts[geom.pts.length - 1]
  const activePt = active != null && geom ? geom.pts[active] : null
  const activeBelow = activePt != null && activePt.y / H < 0.42
  const bubbleLeftPct = activePt ? Math.min(86, Math.max(14, (activePt.x / W) * 100)) : 0

  return (
    <div className={cn('relative', className)} dir="ltr">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y select-none"
        role="img"
        aria-label={ariaLabel}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.16" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* hairline grid */}
        {[0.25, 0.5, 0.75].map((f) => {
          const gy = PAD_TOP + PLOT_H * f
          return (
            <line
              key={f}
              x1={PAD_X}
              y1={gy}
              x2={W - PAD_X}
              y2={gy}
              stroke="var(--foreground)"
              strokeOpacity="0.07"
              strokeWidth="1"
              strokeDasharray="2 6"
            />
          )
        })}

        {/* target reference */}
        {geom && target != null && (
          <g>
            <line
              x1={PAD_X}
              y1={geom.yOf(target)}
              x2={W - PAD_X}
              y2={geom.yOf(target)}
              stroke={color}
              strokeOpacity="0.35"
              strokeWidth="1"
              strokeDasharray="4 5"
            />
            <text
              x={W - PAD_X}
              y={geom.yOf(target) - 4}
              textAnchor="end"
              fontSize="8"
              fontWeight="600"
              fill={color}
              fillOpacity="0.55"
            >
              {targetLabel} {formatValue(target)}
            </text>
          </g>
        )}

        {/* series */}
        {geom && mode === 'line' && linePath && (
          <>
            <motion.path
              d={areaPath}
              fill={`url(#${gradId})`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.25 }}
            />
            <motion.path
              d={linePath}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
            />
          </>
        )}

        {geom && mode === 'bar' && barGeom && (
          <g>
            {points.map((p, i) => {
              const x = geom.pts[i].x - barGeom.barW / 2
              const yTop = geom.yOf(p.value)
              const h = Math.max(geom.baseY - yTop, 2)
              const hit = target != null && Math.abs(p.value - target) <= target * 0.075
              const delay = Math.min(0.5, i * (0.4 / Math.max(n, 1)))
              return (
                <motion.rect
                  key={p.date}
                  x={x}
                  y={yTop}
                  width={barGeom.barW}
                  height={h}
                  rx={Math.min(3, barGeom.barW / 2)}
                  fill={color}
                  fillOpacity={hit ? 0.95 : 0.3}
                  style={{ transformBox: 'fill-box', transformOrigin: 'bottom' }}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.45, delay, ease: 'easeOut' }}
                />
              )
            })}
          </g>
        )}

        {/* regular dots */}
        {geom && showDots && (
          <g>
            {geom.pts.slice(0, -1).map((pt, i) => (
              <circle key={points[i].date} cx={pt.x} cy={pt.y} r="1.7" fill={color} fillOpacity="0.85" />
            ))}
          </g>
        )}

        {/* end-point marker */}
        {geom && lastPoint && (
          <motion.g
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: mode === 'line' ? 0.7 : 0.35, duration: 0.35 }}
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          >
            <circle cx={lastPoint.x} cy={lastPoint.y} r="7" fill={color} fillOpacity="0.14" />
            <circle cx={lastPoint.x} cy={lastPoint.y} r="3.2" fill={color} stroke="var(--card)" strokeWidth="1.5" />
          </motion.g>
        )}

        {/* scrub layer */}
        {activePt && (
          <g pointerEvents="none">
            <line
              x1={activePt.x}
              y1={PAD_TOP}
              x2={activePt.x}
              y2={geom?.baseY}
              stroke="var(--foreground)"
              strokeOpacity="0.22"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <circle cx={activePt.x} cy={activePt.y} r="8" fill={color} fillOpacity="0.14" />
            <circle cx={activePt.x} cy={activePt.y} r="4.2" fill={color} stroke="var(--card)" strokeWidth="2" />
          </g>
        )}

        {/* x labels — start / middle / end */}
        {geom && n >= 2 && (
          <g fontSize="8" fill="var(--foreground)" fillOpacity="0.42">
            <text x={PAD_X} y={H - 7} textAnchor="start">
              {formatDate(points[0].date)}
            </text>
            {n >= 8 && (
              <text x={W / 2} y={H - 7} textAnchor="middle">
                {formatDate(points[Math.floor(n / 2)].date)}
              </text>
            )}
            <text x={W - PAD_X} y={H - 7} textAnchor="end">
              {formatDate(points[n - 1].date)}
            </text>
          </g>
        )}

        {/* interaction surface */}
        <rect
          x="0"
          y="0"
          width={W}
          height={H}
          fill="transparent"
          onPointerDown={locate}
          onPointerMove={(e) => {
            if (e.buttons > 0 || e.pointerType === 'mouse') locate(e)
          }}
          onPointerUp={(e) => {
            if (e.pointerType !== 'mouse') setActive(null)
          }}
          onPointerLeave={() => setActive(null)}
        />
      </svg>

      {/* scrub bubble */}
      {activePt && active != null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-xl border border-border bg-card px-2.5 py-1.5 text-center shadow-[0_6px_20px_-8px_oklch(0.25_0.05_230/0.35)]"
          style={{
            left: `${bubbleLeftPct}%`,
            top: `${(activePt.y / H) * 100}%`,
            transform: activeBelow
              ? 'translate(-50%, calc(-100% - 10px))'
              : 'translate(-50%, 14px)',
          }}
        >
          <p className="tnum text-[15px] font-bold leading-5 text-foreground">
            {formatValue(points[active].value)}
            <span className="ms-1 text-[10px] font-normal text-muted-foreground">{unit}</span>
          </p>
          <p className="text-[10px] leading-4 text-muted-foreground">{formatDate(points[active].date)}</p>
        </div>
      )}
    </div>
  )
}
