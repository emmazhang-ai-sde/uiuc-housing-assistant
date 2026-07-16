import { Filters } from "@/lib/api"
import { COMPANIES } from "@/lib/companies"

const BED_OPTIONS: { label: string; value: number | null }[] = [
  { label: "Any",    value: null },
  { label: "Studio", value: 0 },
  { label: "1",      value: 1 },
  { label: "2",      value: 2 },
  { label: "3",      value: 3 },
  { label: "4",      value: 4 },
  { label: "5+",     value: 5 },
]

const AVAIL_OPTIONS: { label: string; value: "now" | "june_2026" | "july_2026" | "august_2026" | "leased" | null }[] = [
  { label: "All",     value: null },
  { label: "Now",     value: "now" },
  { label: "Jun '26", value: "june_2026" },
  { label: "Jul '26", value: "july_2026" },
  { label: "Aug '26", value: "august_2026" },
  { label: "Leased",  value: "leased" },
]

const labelCls  = "text-ink-900 font-bold text-xs shrink-0"
const pillBase  = "px-3 py-1 rounded-full text-xs font-medium"
const pillOn    = `${pillBase} bg-ink-900 text-white`
const pillOff   = `${pillBase} bg-mist-100 text-neutral-900`

function ReadOnlyFilterSnapshot({ filters }: { filters: Filters }) {
  const selectedBeds = filters.beds ?? []
  const bufferType   = filters.buffer_type ?? "percent"
  const bufferValue  = filters.buffer_value ?? (bufferType === "fixed" ? 50 : 15)

  return (
    <div className="w-full rounded-2xl bg-white border border-mist-100 px-5 py-3 text-sm shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] flex flex-col gap-2">

      {/* 2-col grid: Type+Beds | Max$/bed+Buffer */}
      <div className="grid grid-cols-2 gap-6 w-full">
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex items-center gap-5 shrink-0">
            <span className={`w-16 ${labelCls}`}>Type</span>
            <div className="flex gap-1">
              {([null, "Apartment", "House"] as const).map(v => (
                <span key={v ?? "all"} className={filters.property_type === v ? pillOn : pillOff}>
                  {v ?? "All"}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-5 shrink-0">
            <span className={`w-16 ${labelCls}`}>Beds</span>
            <div className="flex gap-1">
              {BED_OPTIONS.map(({ label, value }) => (
                <span key={label} className={value !== null && selectedBeds.includes(value) ? pillOn : pillOff}>
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex items-center gap-5 shrink-0">
            <span className={`w-20 ${labelCls}`}>Max $/bed</span>
            <span className="inline-flex w-16 items-center gap-1 rounded-full bg-mist-100 py-1 pl-3 pr-2 text-xs text-neutral-700">
              <span className="text-neutral-400">$</span>
              <span>{filters.max_price_per_bed ?? "900"}</span>
            </span>
          </div>
          <div className={`flex items-center gap-5 shrink-0 ${filters.max_price_per_bed === null ? "opacity-35" : ""}`}>
            <span className={`w-20 ${labelCls}`}>Buffer</span>
            <div className="flex gap-1 items-center">
              {([ ["exact", "exact"], ["percent", "+%"], ["fixed", "+$"] ] as const).map(([type, label]) => (
                <span key={type} className={bufferType === type ? pillOn : pillOff}>{label}</span>
              ))}
              {bufferType !== "exact" && (
                <span className="w-11 rounded-full bg-mist-100 px-2.5 py-1 text-xs text-neutral-700">
                  {bufferValue}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Availability — full-width row */}
      <div className="flex items-center gap-5 shrink-0">
        <span className={`w-16 ${labelCls}`}>Availability</span>
        <div className="flex gap-1">
          {AVAIL_OPTIONS.map(({ label, value }) => (
            <span key={value ?? "all"} className={filters.availability_window === value ? pillOn : pillOff}>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Source — full-width row */}
      <div className="flex items-center gap-5 shrink-0">
        <span className={`w-16 ${labelCls}`}>Source</span>
        <div className="flex gap-1">
          <span className={filters.company === null ? pillOn : pillOff}>All</span>
          {COMPANIES.map(({ name, logo }) => (
            <span
              key={name}
              title={name}
              className={`px-2.5 py-1 rounded-full ${filters.company === name ? "bg-ink-900" : "bg-mist-100"}`}
            >
              <img src={logo} alt={name} className="h-4 object-contain" />
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function hasActiveFilters(f: Filters): boolean {
  return (
    f.beds !== null ||
    f.availability_window !== null ||
    f.max_price_per_bed !== null ||
    f.company !== null ||
    f.property_type !== null ||
    f.penthouse !== null
  )
}

export default function UserBubble({ text, filters }: { text: string; filters: Filters }) {
  return (
    <div className="flex justify-end items-start gap-3 mt-10 mb-4">
      <div className="flex max-w-[80%] flex-col items-end gap-3">
        {hasActiveFilters(filters) && <ReadOnlyFilterSnapshot filters={filters} />}
        <div className="bg-[linear-gradient(266deg,#ACFFE1,#CFFFC4)] rounded-3xl rounded-tr-lg px-5 py-3.5 text-[15px] text-ink-900 font-medium leading-relaxed">
          {text}
        </div>
      </div>
      <div className="w-8 h-8 bg-mint-200 rounded-full flex items-center justify-center shrink-0 text-sm">
        🌽
      </div>
    </div>
  )
}
