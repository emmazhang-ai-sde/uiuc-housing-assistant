"use client"

// Return-frequency distribution for /admin/activity: how many people came back
// N times, where a return is an active day after the first. One series, so no
// legend box — the card title above names what's plotted (dataviz skill). The
// 0 bucket (never came back) is deliberately kept: it's the churn half of the
// same story the "Returning users" card tells as a single percentage, and
// dropping it would make the tail look healthier than it is.
import { useMemo, useRef, useState } from "react"

const SERIES_COLOR = "#ff5f05" // Illini orange — same series hue as GrowthChart
const CHURN_COLOR = "#d4d4d4"  // neutral-300: the 0 bucket is context, not the story
const GRID_COLOR = "#e5e5e5"   // matches Tailwind neutral-200
const AXIS_TEXT = "#a3a3a3"    // neutral-400, muted/recessive per spec
const INK = "#171717"          // neutral-900, for direct labels (text token, never the series color)

// Matches GrowthChart's box so the two cards in the row render at the same
// height; the width is tuned for a half-width card (see GrowthChart).
const VB_W = 560
const VB_H = 230
const PAD = { top: 22, right: 16, bottom: 44, left: 36 }
const MAX_BAR_W = 24 // cap thickness; the band's leftover stays as air
const BAR_GAP = 2    // surface gap between adjacent bars

export interface ReturnBucket {
  returns: number
  users: number
  capped?: boolean
}

function niceCeil(max: number): number {
  if (max <= 0) return 4
  const step =
    max <= 10 ? 2 :
    max <= 50 ? 5 :
    max <= 100 ? 10 :
    max <= 500 ? 50 :
    Math.pow(10, Math.floor(Math.log10(max)))
  return Math.ceil(max / step) * step
}

function bucketLabel(b: ReturnBucket): string {
  return b.capped ? `${b.returns}+` : String(b.returns)
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`
}

export default function ReturnFrequencyChart({ data }: { data: ReturnBucket[] }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const totalUsers = data.reduce((sum, b) => sum + b.users, 0)

  const { bars, yMax, yTicks, plotH, baselineY } = useMemo(() => {
    const plotW = VB_W - PAD.left - PAD.right
    const plotH = VB_H - PAD.top - PAD.bottom
    const baselineY = PAD.top + plotH
    const maxUsers = data.length ? Math.max(...data.map(d => d.users)) : 0
    const yMax = niceCeil(maxUsers) || 4

    const band = data.length ? plotW / data.length : plotW
    const barW = Math.min(MAX_BAR_W, Math.max(band - BAR_GAP, 1))

    const bars = data.map((d, i) => {
      const h = (d.users / yMax) * plotH
      return {
        ...d,
        // Center each bar in its band so the leftover reads as air, not a gap
        // hunting for a bar.
        x: PAD.left + band * i + (band - barW) / 2,
        cx: PAD.left + band * i + band / 2,
        y: baselineY - h,
        w: barW,
        h,
      }
    })

    // Users are whole people, so the ticks have to be whole numbers: pick the
    // densest tick count that divides yMax exactly, rather than slicing into
    // quarters and rounding (which yields 0/6/13/19/25).
    const tickCount = [5, 4, 3, 2].find(n => yMax % n === 0) ?? 1
    const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => (yMax / tickCount) * i)
    return { bars, yMax, yTicks, plotH, baselineY }
  }, [data])

  if (data.length === 0 || totalUsers === 0) {
    return <div className="text-sm text-neutral-400 py-8 text-center">No activity logged yet.</div>
  }

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const xUser = ((e.clientX - rect.left) / rect.width) * VB_W
    let nearest = 0
    let best = Infinity
    bars.forEach((b, i) => {
      const d = Math.abs(b.cx - xUser)
      if (d < best) { best = d; nearest = i }
    })
    setHoverIdx(nearest)
  }

  const hovered = hoverIdx !== null ? bars[hoverIdx] : null
  // Keep the tooltip box on-screen near either edge.
  const tooltipX = hovered ? Math.min(Math.max(hovered.cx, PAD.left + 70), VB_W - PAD.right - 70) : 0

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="w-full h-auto touch-none"
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverIdx(null)}
      >
        {/* Gridlines + y-axis ticks — recessive, hairline */}
        {yTicks.map(t => {
          const y = baselineY - (t / yMax) * plotH
          return (
            <g key={t}>
              <line x1={PAD.left} y1={y} x2={VB_W - PAD.right} y2={y} stroke={GRID_COLOR} strokeWidth={1} />
              <text x={PAD.left - 8} y={y + 3} textAnchor="end" fontSize={10} fill={AXIS_TEXT}>
                {t}
              </text>
            </g>
          )
        })}

        {bars.map((b, i) => {
          const isChurn = b.returns === 0
          const fill = isChurn ? CHURN_COLOR : SERIES_COLOR
          return (
            <g key={b.returns}>
              {/* Hit target — full band height, so a 1-user bar is still easy to hover */}
              <rect
                x={b.cx - Math.max(b.w, 16) / 2}
                y={PAD.top}
                width={Math.max(b.w, 16)}
                height={plotH}
                fill="transparent"
              />
              {b.users > 0 && (
                // 4px rounded data-end, square at the baseline: draw the round
                // rect, then square off its bottom with an overlapping rect.
                <g opacity={hoverIdx === null || hoverIdx === i ? 1 : 0.55}>
                  <rect x={b.x} y={b.y} width={b.w} height={Math.max(b.h, 2)} rx={4} fill={fill} />
                  <rect x={b.x} y={Math.max(b.y + b.h - 4, b.y)} width={b.w} height={Math.min(4, b.h)} fill={fill} />
                </g>
              )}
              {/* Value on the cap — few enough bars that every one can carry its
                  count without the flooding the skill warns about */}
              {b.users > 0 && (
                <text x={b.cx} y={b.y - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill={INK}>
                  {b.users}
                </text>
              )}
              {/* X-axis: number of returns */}
              <text x={b.cx} y={baselineY + 15} textAnchor="middle" fontSize={10} fill={AXIS_TEXT}>
                {bucketLabel(b)}
              </text>
            </g>
          )
        })}

        {/* Baseline */}
        <line x1={PAD.left} y1={baselineY} x2={VB_W - PAD.right} y2={baselineY} stroke={GRID_COLOR} strokeWidth={1} />

        {/* X-axis title — the bucket numbers are meaningless without it */}
        <text x={PAD.left + (VB_W - PAD.left - PAD.right) / 2} y={VB_H - 4} textAnchor="middle" fontSize={10} fill={AXIS_TEXT}>
          Times came back (days active after the first)
        </text>
      </svg>

      {/* Tooltip */}
      {hovered && (
        <div
          className="absolute top-1 -translate-x-1/2 bg-neutral-900 text-white text-xs rounded-lg px-2.5 py-1.5 pointer-events-none whitespace-nowrap shadow-lg"
          style={{ left: `${(tooltipX / VB_W) * 100}%` }}
        >
          <span className="font-bold">{plural(hovered.users, "user")}</span>
          <span className="text-neutral-300">
            {hovered.returns === 0
              ? " never came back"
              : ` came back ${bucketLabel(hovered)} ${hovered.returns === 1 && !hovered.capped ? "time" : "times"}`}
            {" · "}
            {Math.round((hovered.users / totalUsers) * 100)}% of users
          </span>
        </div>
      )}
    </div>
  )
}
