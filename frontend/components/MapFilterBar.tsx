"use client"

import { Filters, DEFAULT_FILTERS } from "@/lib/api"
import { COMPANIES } from "@/lib/companies"

type Props = {
  filters: Filters
  onChange: (f: Filters) => void
}

const BED_OPTIONS: { label: string; value: number | null }[] = [
  { label: "Any",    value: null },
  { label: "Studio", value: 0 },
  { label: "1",      value: 1 },
  { label: "2",      value: 2 },
  { label: "3",      value: 3 },
  { label: "4",      value: 4 },
  { label: "5+",     value: 5 },
]

const AVAIL_OPTIONS: { label: string; value: "now" | "june_2026" | "july_2026" | "august_2026" | "leased" | null; dot?: string; dotBorder?: boolean }[] = [
  { label: "All",     value: null },
  { label: "Now",     value: "now",         dot: "#D2F55E" },
  { label: "Jun '26", value: "june_2026" },
  { label: "Jul '26", value: "july_2026" },
  { label: "Aug '26", value: "august_2026", dot: "#C7DDB5" },
  { label: "Leased",  value: "leased",      dot: "#f5f5f5", dotBorder: true },
]

function Pill({ active, onClick, children }: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
        active
          ? "bg-neutral-900 text-white"
          : "bg-neutral-100 text-neutral-900 hover:bg-neutral-200"
      }`}
    >
      {children}
    </button>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-bold text-neutral-500 shrink-0 w-14">{children}</span>
  )
}

function Divider() {
  return <div className="h-px bg-neutral-100 -mx-1" />
}

export default function MapFilterBar({ filters, onChange }: Props) {
  const labelCls = "text-[11px] font-bold text-neutral-500 shrink-0 w-14"

  function toggleBed(value: number | null) {
    if (value === null) {
      onChange({ ...filters, beds: null })
      return
    }
    const cur = filters.beds ?? []
    const next = cur.includes(value) ? cur.filter(b => b !== value) : [...cur, value]
    onChange({ ...filters, beds: next.length ? next : null })
  }

  const hasAnyFilter =
    !!filters.beds?.length ||
    filters.max_price_per_bed != null ||
    !!filters.property_type ||
    filters.availability_window != null ||
    !!filters.company

  return (
    <div className="absolute top-4 left-4 z-10">
      <div className="bg-white/92 backdrop-blur-sm rounded-2xl shadow-md px-4 py-3 flex flex-col gap-2.5 text-sm min-w-max">

        {/* Beds */}
        <div className="flex items-center gap-3">
          <span className={labelCls}>Beds</span>
          <div className="flex gap-1">
            {BED_OPTIONS.map(({ label, value }) => {
              const active = value === null
                ? !filters.beds?.length
                : (filters.beds ?? []).includes(value)
              return (
                <Pill key={label} active={active} onClick={() => toggleBed(value)}>
                  {label}
                </Pill>
              )
            })}
          </div>
        </div>

        <Divider />

        {/* Price */}
        <div className="flex items-center gap-3">
          <span className={labelCls}>Max $/bed</span>
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-xs pointer-events-none">$</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                placeholder="900"
                value={filters.max_price_per_bed ?? ""}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 4)
                  onChange({ ...filters, max_price_per_bed: v ? Number(v) : null })
                }}
                className="pl-6 pr-2 py-1 w-16 rounded-full text-xs text-neutral-700 bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-300"
              />
            </div>
            <div className={`flex gap-1 items-center transition-opacity ${filters.max_price_per_bed == null ? "opacity-35 pointer-events-none" : ""}`}>
              {([ ["exact", "Exact"], ["percent", "+%"], ["fixed", "+$"] ] as const).map(([type, label]) => (
                <Pill
                  key={type}
                  active={(filters.buffer_type ?? "percent") === type}
                  onClick={() => onChange({
                    ...filters,
                    buffer_type: type,
                    buffer_value: type === "percent" ? 15 : type === "fixed" ? 50 : null,
                  })}
                >
                  {label}
                </Pill>
              ))}
              {(filters.buffer_type ?? "percent") !== "exact" && (
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={3}
                  value={filters.buffer_value ?? ""}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 3)
                    onChange({ ...filters, buffer_value: v ? Number(v) : null })
                  }}
                  className="w-11 px-2.5 py-1 rounded-full text-xs text-neutral-700 bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-300"
                />
              )}
            </div>
          </div>
        </div>

        <Divider />

        {/* Type */}
        <div className="flex items-start gap-3">
          <span className={`${labelCls} pt-0.5`}>Type</span>
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-1">
              {([
                { value: null,        label: "All" },
                { value: "Apartment",          label: "Apartment" },
                { value: "House",              label: "House" },
                { value: "Townhouse",          label: "Townhouse" },
                { value: "Single Family Home", label: "Single Family" },
              ] as const).map(({ value, label }) => (
                <Pill
                  key={value ?? "all"}
                  active={filters.property_type === value}
                  onClick={() => onChange({ ...filters, property_type: filters.property_type === value ? null : value, penthouse: null })}
                >
                  {label}
                </Pill>
              ))}
            </div>
            {filters.property_type === "Apartment" && (
              <div className="flex gap-1">
                {([
                  { value: null, label: "All" },
                  { value: true, label: "Penthouse" },
                ] as const).map(({ value, label }) => (
                  <Pill
                    key={label}
                    active={filters.penthouse === value}
                    onClick={() => onChange({ ...filters, penthouse: filters.penthouse === value ? null : value })}
                  >
                    {label}
                  </Pill>
                ))}
              </div>
            )}
          </div>
        </div>

        <Divider />

        {/* Availability */}
        <div className="flex items-center gap-3">
          <span className={labelCls}>Availability</span>
          <div className="flex gap-1">
            {AVAIL_OPTIONS.map(({ label, value, dot, dotBorder }) => (
              <Pill
                key={label}
                active={filters.availability_window === value}
                onClick={() => onChange({ ...filters, availability_window: value })}
              >
                <span className="flex items-center gap-1.5">
                  {label}
                  {dot && (
                    <span
                      style={{
                        background: dot,
                        boxShadow: dotBorder ? "0 0 0 1px #d4d4d4" : undefined,
                      }}
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                    />
                  )}
                </span>
              </Pill>
            ))}
          </div>
        </div>

        <Divider />

        {/* Source */}
        <div className="flex items-center gap-3">
          <span className={labelCls}>Source</span>
          <div className="flex gap-1 items-center">
            <Pill
              active={filters.company === null}
              onClick={() => onChange({ ...filters, company: null })}
            >
              All
            </Pill>
            {COMPANIES.map(({ name, logo }) => (
              <button
                key={name}
                title={name}
                onClick={() => onChange({ ...filters, company: filters.company === name ? null : name })}
                className={`px-2.5 py-1 rounded-full transition-colors ${
                  filters.company === name ? "bg-neutral-900" : "bg-neutral-100 hover:bg-neutral-200"
                }`}
              >
                <img src={logo} alt={name} className="h-4 object-contain" />
              </button>
            ))}
          </div>
        </div>

        {/* Clear all */}
        {hasAnyFilter && (
          <>
            <Divider />
            <div className="flex justify-end">
              <button
                onClick={() => onChange(DEFAULT_FILTERS)}
                className="text-xs text-neutral-400 hover:text-neutral-700 transition-colors"
              >
                Clear all
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
