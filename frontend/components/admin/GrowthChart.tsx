"use client"

// Cumulative-growth line chart for "Users who've used it". Single series, so no
// legend box is needed — the card title above it already names what's plotted
// (dataviz skill: a lone series needs no legend, text never wears the data
// color, and the hover layer is part of the deliverable, not an upgrade).
import { useMemo, useRef, useState } from "react"

const SERIES_COLOR = "#ff5f05" // Illini orange — this app's existing brand accent
const GRID_COLOR = "#e5e5e5"   // matches Tailwind neutral-200
const AXIS_TEXT = "#a3a3a3"    // neutral-400, muted/recessive per spec
const INK = "#171717"          // neutral-900, for the direct end-label (text token, not series color)

const VB_W = 700
const VB_H = 220
const PAD = { top: 20, right: 16, bottom: 26, left: 36 }

function niceCeil(max: number): number {
  if (max <= 0) return 4
  const step =
    max <= 10 ? 2 :
    max <= 50 ? 5 :
    max <= 100 ? 10 :
    max <= 500 ? 50 :
    max <= 1000 ? 100 :
    Math.pow(10, Math.floor(Math.log10(max)))
  return Math.ceil(max / step) * step
}

function formatDate(d: string): string {
  const [, m, day] = d.split("-")
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${months[Number(m) - 1]} ${Number(day)}`
}

type Range = "7d" | "30d" | "90d" | "365d" | "all"
const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: "7d", label: "1 week" },
  { value: "30d", label: "1 month" },
  { value: "90d", label: "3 months" },
  { value: "365d", label: "1 year" },
  { value: "all", label: "All" },
]
const RANGE_DAYS: Record<Range, number | null> = { "7d": 7, "30d": 30, "90d": 90, "365d": 365, all: null }

export default function GrowthChart({ data }: { data: { date: string; users: number }[] }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [range, setRange] = useState<Range>("all")

  // Slice client-side — `data` already has one row per calendar day, sorted
  // ascending, so "last N days" is just the last N entries. Values stay true
  // cumulative totals (not re-based to 0), so a narrower range reads as a
  // zoom into the same curve, not a different metric.
  const filtered = useMemo(() => {
    const days = RANGE_DAYS[range]
    return days ? data.slice(-days) : data
  }, [data, range])

  const { points, yMax, yTicks, plotH } = useMemo(() => {
    const plotW = VB_W - PAD.left - PAD.right
    const plotH = VB_H - PAD.top - PAD.bottom
    const maxUsers = filtered.length ? Math.max(...filtered.map(d => d.users)) : 0
    const yMax = niceCeil(maxUsers) || 4
    const n = Math.max(filtered.length - 1, 1)
    const points = filtered.map((d, i) => ({
      x: PAD.left + (i / n) * plotW,
      y: PAD.top + plotH - (d.users / yMax) * plotH,
      ...d,
    }))
    const tickCount = 4
    const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => Math.round((yMax / tickCount) * i))
    return { points, yMax, yTicks, plotW, plotH }
  }, [filtered])

  const rangeRow = (
    <div className="flex items-center gap-1 bg-neutral-100 rounded-full p-0.5 mb-3 w-fit">
      {RANGE_OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => setRange(value)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            range === value ? "bg-black text-white" : "text-neutral-600 hover:text-neutral-900"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )

  if (data.length === 0) {
    return <div className="text-sm text-neutral-400 py-8 text-center">No activity logged yet.</div>
  }

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ")
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${PAD.top + plotH} L ${points[0].x.toFixed(2)} ${PAD.top + plotH} Z`

  // Show ~5 x-axis labels max (first, last, evenly spaced between) so dense
  // daily data doesn't collide.
  const labelCount = Math.min(5, points.length)
  const labelIdxs = Array.from({ length: labelCount }, (_, i) =>
    Math.round((i / Math.max(labelCount - 1, 1)) * (points.length - 1))
  )

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const xUser = ((e.clientX - rect.left) / rect.width) * VB_W
    let nearest = 0
    let best = Infinity
    points.forEach((p, i) => {
      const d = Math.abs(p.x - xUser)
      if (d < best) { best = d; nearest = i }
    })
    setHoverIdx(nearest)
  }

  const hovered = hoverIdx !== null ? points[hoverIdx] : null
  // Keep the tooltip box on-screen near either edge.
  const tooltipX = hovered ? Math.min(Math.max(hovered.x, PAD.left + 55), VB_W - PAD.right - 55) : 0

  return (
    <div className="relative">
      {rangeRow}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="w-full h-auto touch-none"
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverIdx(null)}
      >
        {/* Gridlines + y-axis ticks — recessive, hairline */}
        {yTicks.map(t => {
          const y = PAD.top + plotH - (t / yMax) * plotH
          return (
            <g key={t}>
              <line x1={PAD.left} y1={y} x2={VB_W - PAD.right} y2={y} stroke={GRID_COLOR} strokeWidth={1} />
              <text x={PAD.left - 8} y={y + 3} textAnchor="end" fontSize={10} fill={AXIS_TEXT}>
                {t.toLocaleString()}
              </text>
            </g>
          )
        })}

        {/* X-axis date labels */}
        {labelIdxs.map(i => (
          <text key={i} x={points[i].x} y={VB_H - 6} textAnchor="middle" fontSize={10} fill={AXIS_TEXT}>
            {formatDate(points[i].date)}
          </text>
        ))}

        {/* Area wash under the line — series hue at ~10% opacity */}
        <path d={areaPath} fill={SERIES_COLOR} fillOpacity={0.1} stroke="none" />

        {/* Line — 2px, round join/cap */}
        <path d={linePath} fill="none" stroke={SERIES_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* End marker — >=8px, 2px surface ring */}
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={5} fill={SERIES_COLOR} stroke="#fff" strokeWidth={2} />

        {/* Direct end label — value at the end; text token color, never the series color */}
        <text
          x={points[points.length - 1].x - 8}
          y={points[points.length - 1].y - 10}
          textAnchor="end"
          fontSize={12}
          fontWeight={700}
          fill={INK}
        >
          {points[points.length - 1].users.toLocaleString()}
        </text>

        {/* Hover crosshair */}
        {hovered && (
          <>
            <line x1={hovered.x} y1={PAD.top} x2={hovered.x} y2={PAD.top + plotH} stroke={AXIS_TEXT} strokeWidth={1} strokeDasharray="2,2" />
            <circle cx={hovered.x} cy={hovered.y} r={5} fill={SERIES_COLOR} stroke="#fff" strokeWidth={2} />
          </>
        )}
      </svg>

      {/* Tooltip */}
      {hovered && (
        <div
          className="absolute top-1 -translate-x-1/2 bg-neutral-900 text-white text-xs rounded-lg px-2.5 py-1.5 pointer-events-none whitespace-nowrap shadow-lg"
          style={{ left: `${(tooltipX / VB_W) * 100}%` }}
        >
          <span className="font-bold">{hovered.users.toLocaleString()}</span>
          <span className="text-neutral-300"> users · {formatDate(hovered.date)}</span>
        </div>
      )}
    </div>
  )
}
