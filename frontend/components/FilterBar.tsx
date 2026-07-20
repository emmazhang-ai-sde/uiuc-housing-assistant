"use client"

import { Filters, DEFAULT_FILTERS } from "@/lib/api"
import { COMPANIES, UNSCRAPABLE_COMPANIES, FULLY_LEASED_COMPANIES, ExcludedCompany } from "@/lib/companies"
import { BED_OPTIONS, AVAIL_OPTIONS } from "@/lib/filterOptions"

type Props = {
  filters: Filters
  onChange: (f: Filters) => void
  className?: string
}

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
          ? "bg-ink-900 text-white"
          : "bg-mist-100 text-neutral-900 hover:bg-neutral-200"
      }`}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <div className="h-px bg-mist-100 -mx-1" />
}

export default function FilterBar({ filters, onChange, className = "" }: Props) {
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

  function toggleCompany(name: string) {
    const cur = filters.company ?? []
    const next = cur.includes(name) ? cur.filter(c => c !== name) : [...cur, name]
    onChange({ ...filters, company: next.length ? next : null })
  }

  const hasAnyFilter =
    !!filters.beds?.length ||
    filters.min_price_per_bed != null ||
    filters.max_price_per_bed != null ||
    !!filters.property_type ||
    filters.availability_window != null ||
    !!filters.company?.length

  return (
    <div className={`bg-white/95 backdrop-blur-sm rounded-2xl border border-mist-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.08)] px-4 py-3 flex flex-col gap-2.5 text-sm min-w-max ${className}`}>

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

      {/* Price — a range as of 2026-07-20. The buffer applies to the max only. */}
      <div className="flex items-center gap-3">
        <span className={labelCls}>$/bed</span>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-xs pointer-events-none">$</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              placeholder="Min"
              value={filters.min_price_per_bed ?? ""}
              onChange={e => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 4)
                onChange({ ...filters, min_price_per_bed: v ? Number(v) : null })
              }}
              className="pl-6 pr-2 py-1 w-16 rounded-full text-xs text-neutral-700 bg-mist-100 focus:outline-none focus:ring-2 focus:ring-mint-400"
            />
          </div>
          <span className="text-neutral-400 text-xs">–</span>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-xs pointer-events-none">$</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              placeholder="Max"
              value={filters.max_price_per_bed ?? ""}
              onChange={e => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 4)
                onChange({ ...filters, max_price_per_bed: v ? Number(v) : null })
              }}
              className="pl-6 pr-2 py-1 w-16 rounded-full text-xs text-neutral-700 bg-mist-100 focus:outline-none focus:ring-2 focus:ring-mint-400"
            />
          </div>
          <div className={`flex gap-1 items-center transition-opacity ${filters.max_price_per_bed == null ? "opacity-35 pointer-events-none" : ""}`}>
            {([ ["exact", "Exact"], ["percent", "+%"], ["fixed", "+$"] ] as const).map(([type, label]) => (
              <Pill
                key={type}
                active={filters.buffer_type === type}
                onClick={() => onChange({
                  ...filters,
                  buffer_type: type,
                  buffer_value: type === "percent" ? 15 : type === "fixed" ? 50 : null,
                })}
              >
                {label}
              </Pill>
            ))}
            {/* Amount box belongs to +%/+$ only — see FilterChips.tsx */}
            {(filters.buffer_type === "percent" || filters.buffer_type === "fixed") && (
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
                className="w-11 px-2.5 py-1 rounded-full text-xs text-neutral-700 bg-mist-100 focus:outline-none focus:ring-2 focus:ring-mint-400"
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

      {/* Source — "All" sits on the Source row itself; below it, one row per
          coverage category (jobright green/red labels since the 2026-07-15
          restyle) so users can see which companies are searchable, which can't
          be scraped (ToS or bot protection, reason in the tooltip), and which
          publish no data right now. */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <span className={labelCls}>Source</span>
          <Pill
            active={!filters.company?.length}
            onClick={() => onChange({ ...filters, company: null })}
          >
            All
          </Pill>
        </div>
        <div className="flex flex-col gap-1.5 pl-[68px]">
          <div className="flex items-center gap-1 flex-wrap max-w-[340px]">
            <span className="text-[10px] font-semibold text-mint-600 uppercase tracking-wide mr-1">Scraped</span>
            {COMPANIES.map(({ name, logo }) => (
              <button
                key={name}
                title={name}
                onClick={() => toggleCompany(name)}
                className={`px-2.5 py-1 rounded-full transition-colors ${
                  filters.company?.includes(name) ? "bg-ink-900" : "bg-mist-100 hover:bg-neutral-200"
                }`}
              >
                <img src={logo} alt={name} className="h-4 object-contain" />
              </button>
            ))}
          </div>
          <ExcludedRow label="Not able to scrape" labelClassName="text-[#FF465A]" companies={UNSCRAPABLE_COMPANIES} />
          <ExcludedRow label="Fully leased" companies={FULLY_LEASED_COMPANIES} />
        </div>
      </div>

      {/* Clear all */}
      {hasAnyFilter && (
        <>
          <Divider />
          <div className="flex justify-end">
            <button
              onClick={() => onChange(DEFAULT_FILTERS)}
              className="text-xs text-neutral-400 hover:text-ink-900 transition-colors"
            >
              Clear all
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// Muted, non-clickable chips for companies we can't include. A chip renders the
// company logo when one is set in lib/companies.ts, otherwise its name; the
// exclusion reason shows as a tooltip.
function ExcludedRow({ label, labelClassName = "text-neutral-400", companies }: {
  label: string
  labelClassName?: string
  companies: ExcludedCompany[]
}) {
  return (
    <div className="flex items-center gap-1 flex-wrap max-w-[340px]">
      <span className={`text-[10px] font-semibold uppercase tracking-wide mr-1 ${labelClassName}`}>
        {label}
      </span>
      {companies.map(({ name, reason, logo, dark }) => (
        <span
          key={name}
          title={reason}
          className={`px-2 py-0.5 rounded-full text-[10px] text-neutral-400 cursor-default whitespace-nowrap ${
            dark ? "bg-neutral-400" : "bg-neutral-50"
          }`}
        >
          {logo
            ? <img src={logo} alt={name} className={`h-3.5 object-contain ${dark ? "opacity-90" : "opacity-50"}`} />
            : name}
        </span>
      ))}
    </div>
  )
}
