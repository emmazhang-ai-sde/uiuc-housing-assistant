"use client"

// Expedia-style horizontal filter chips, used by the Map and Card views
// (2026-07-20). Both are content-first surfaces — a full-bleed map, a card grid —
// so their filters collapse into one centred row that opens dropdowns on demand,
// instead of the older always-open stacked filter panel archived with Table
// (components/FilterBar.tsx). Both components drive the same Filters object and
// share their option lists via lib/filterOptions.ts, so the choices cannot drift.
//
// Previous versions archived at design-docs/post-launch/archive/map-page-v1.tsx
// (Map rendered FilterBar through MapFilterBar) and card-page-v1.tsx (Card had a
// left filter sidebar).

import { useEffect, useRef, useState } from "react"
import { Filters, DEFAULT_FILTERS } from "@/lib/api"
import { COMPANIES, UNSCRAPABLE_COMPANIES, FULLY_LEASED_COMPANIES, ExcludedCompany } from "@/lib/companies"
import { BED_OPTIONS, AVAIL_OPTIONS, PROPERTY_TYPE_OPTIONS } from "@/lib/filterOptions"

type Props = {
  filters: Filters
  onChange: (f: Filters) => void
  resultCount?: number | null
  loading?: boolean
  // Rendered as the last item of the row, after the result count. The Map puts
  // its color picker here so the picker wraps with the chips instead of sitting
  // in its own corner of the screen.
  trailing?: React.ReactNode
}

type ChipId = "beds" | "price" | "type" | "availability" | "source"

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
          ? "bg-forest-green text-warm-ivory"
          : "bg-mist-100 text-ink-900 hover:bg-blush-pink"
      }`}
    >
      {children}
    </button>
  )
}

// A chip reads as its filter's name until that filter is set, then as its value
// ("Beds" → "2, 3 beds"), so the active state is legible without opening it.
function Chip({ label, active, open, onToggle, align = "left", children }: {
  label: string
  active: boolean
  open: boolean
  onToggle: () => void
  // Which edge the dropdown is anchored to. The row is centred on the page, so
  // a left-anchored panel on the rightmost chip would spill past the viewport.
  align?: "left" | "right"
  children: React.ReactNode
}) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={`flex items-center gap-1.5 h-9 pl-4 pr-3 rounded-full border text-xs font-semibold whitespace-nowrap transition-colors shadow-[0_2px_10px_-4px_rgba(0,0,0,0.08)] ${
          active
            ? "bg-forest-green text-warm-ivory border-forest-green"
            : open
              ? "bg-warm-ivory text-ink-900 border-forest-green"
              : "bg-warm-ivory/95 backdrop-blur text-ink-900 border-mist-100 hover:border-forest-green"
        }`}
      >
        {label}
        <span
          aria-hidden
          className={`text-[9px] leading-none transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▼
        </span>
      </button>
      {open && (
        <div className={`absolute top-full mt-2 z-50 bg-warm-ivory rounded-2xl border border-mist-100 shadow-[0_8px_30px_-12px_rgba(53,20,11,0.32)] p-4 min-w-max ${
          align === "right" ? "right-0" : "left-0"
        }`}>
          {children}
        </div>
      )}
    </div>
  )
}

function PriceInput({ placeholder, value, onChange }: {
  placeholder: string
  value: number | null
  onChange: (v: number | null) => void
}) {
  return (
    <div className="relative flex-1 min-w-0">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-xs pointer-events-none">$</span>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={e => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 4)
          onChange(v ? Number(v) : null)
        }}
        className="w-full pl-7 pr-3 py-2 rounded-xl border border-mist-100 bg-white/70 text-sm text-ink-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-forest-green transition"
      />
    </div>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-500">{label}</span>
      {children}
    </div>
  )
}

export default function FilterChips({ filters, onChange, resultCount, loading, trailing }: Props) {
  const [open, setOpen] = useState<ChipId | null>(null)
  const rowRef = useRef<HTMLDivElement>(null)

  // Close the open dropdown on an outside click or Escape. Without this the
  // panel stays open while the user pans the map underneath it.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) setOpen(null)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(null)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  function toggle(id: ChipId) {
    setOpen(cur => (cur === id ? null : id))
  }

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

  const beds = filters.beds ?? []
  const bedsLabel = beds.length
    ? beds.slice().sort((a, b) => a - b).map(b => (b === 0 ? "Studio" : b === 5 ? "5+" : String(b))).join(", ") +
      (beds.length === 1 && beds[0] === 0 ? "" : " bed")
    : "Beds"

  const min = filters.min_price_per_bed
  const max = filters.max_price_per_bed
  const priceLabel =
    min != null && max != null ? `$${min.toLocaleString()}–$${max.toLocaleString()}/bed`
    : max != null              ? `≤ $${max.toLocaleString()}/bed`
    : min != null              ? `≥ $${min.toLocaleString()}/bed`
    : "Price"

  const typeLabel = filters.penthouse
    ? "Penthouse"
    : PROPERTY_TYPE_OPTIONS.find(o => o.value === filters.property_type && o.value !== null)?.label ?? "Type"

  const availLabel = AVAIL_OPTIONS.find(o => o.value === filters.availability_window && o.value !== null)?.label ?? "Available"

  const companies = filters.company ?? []
  const sourceLabel =
    companies.length === 0 ? "Source"
    : companies.length === 1 ? companies[0]
    : `${companies.length} sources`

  const hasAnyFilter =
    !!filters.beds?.length ||
    filters.min_price_per_bed != null ||
    filters.max_price_per_bed != null ||
    !!filters.property_type ||
    filters.availability_window != null ||
    companies.length > 0

  return (
    <div ref={rowRef} className="flex items-center gap-2 flex-wrap">
      <Chip label={bedsLabel} active={beds.length > 0} open={open === "beds"} onToggle={() => toggle("beds")}>
        <Group label="Beds">
          <div className="flex gap-1">
            {BED_OPTIONS.map(({ label, value }) => (
              <Pill
                key={label}
                active={value === null ? !beds.length : beds.includes(value)}
                onClick={() => toggleBed(value)}
              >
                {label}
              </Pill>
            ))}
          </div>
        </Group>
      </Chip>

      <Chip label={priceLabel} active={min != null || max != null} open={open === "price"} onToggle={() => toggle("price")}>
        <div className="flex flex-col gap-3 w-[260px]">
          <Group label="$ per bed">
            <div className="flex items-center gap-2">
              <PriceInput
                placeholder="Min"
                value={min}
                onChange={v => onChange({ ...filters, min_price_per_bed: v })}
              />
              <span className="text-neutral-400 text-sm shrink-0">–</span>
              <PriceInput
                placeholder="Max"
                value={max}
                onChange={v => onChange({ ...filters, max_price_per_bed: v })}
              />
            </div>
            {min != null && max != null && min > max && (
              <p className="text-xs text-ink-900 leading-relaxed">
                Min is above max, so nothing can match.
              </p>
            )}
          </Group>
          {/* Tolerance widens the max end only, never the min */}
          <div className={`flex flex-col gap-2 transition-opacity ${max == null ? "opacity-35 pointer-events-none" : ""}`}>
            <Group label="Max tolerance">
              <div className="flex gap-1 items-center">
                {([["exact", "Exact"], ["percent", "+%"], ["fixed", "+$"]] as const).map(([type, label]) => (
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
                {/* The amount box belongs to +%/+$ only — hidden while nothing is
                    picked, so an unset tolerance shows no stray value either. */}
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
                    className="w-14 px-2.5 py-1 rounded-full text-xs text-ink-900 bg-mist-100 focus:outline-none focus:ring-2 focus:ring-forest-green"
                  />
                )}
              </div>
            </Group>
          </div>
        </div>
      </Chip>

      <Chip label={typeLabel} active={!!filters.property_type} open={open === "type"} onToggle={() => toggle("type")}>
        <div className="flex flex-col gap-3">
          <Group label="Property type">
            <div className="flex gap-1 flex-wrap max-w-[320px]">
              {PROPERTY_TYPE_OPTIONS.map(({ value, label }) => (
                <Pill
                  key={value ?? "all"}
                  active={filters.property_type === value}
                  onClick={() => onChange({
                    ...filters,
                    property_type: filters.property_type === value ? null : value,
                    penthouse: null,
                  })}
                >
                  {label}
                </Pill>
              ))}
            </div>
          </Group>
          {filters.property_type === "Apartment" && (
            <Group label="Apartment">
              <div className="flex gap-1">
                {([{ value: null, label: "All" }, { value: true, label: "Penthouse" }] as const).map(({ value, label }) => (
                  <Pill
                    key={label}
                    active={filters.penthouse === value}
                    onClick={() => onChange({ ...filters, penthouse: filters.penthouse === value ? null : value })}
                  >
                    {label}
                  </Pill>
                ))}
              </div>
            </Group>
          )}
        </div>
      </Chip>

      <Chip label={availLabel} active={filters.availability_window != null} open={open === "availability"} onToggle={() => toggle("availability")}>
        <Group label="Availability">
          <div className="flex gap-1 flex-wrap max-w-[320px]">
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
                      style={{ background: dot, boxShadow: dotBorder ? "0 0 0 1px #d4d4d4" : undefined }}
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                    />
                  )}
                </span>
              </Pill>
            ))}
          </div>
        </Group>
      </Chip>

      <Chip label={sourceLabel} active={companies.length > 0} open={open === "source"} onToggle={() => toggle("source")} align="right">
        <div className="flex flex-col gap-3 max-w-[340px]">
          {/* Multi-select: each logo toggles independently, "All" clears them */}
          <Group label={companies.length > 1 ? `Source · ${companies.length} selected` : "Source"}>
            <div className="flex items-center gap-1 flex-wrap">
              <Pill active={companies.length === 0} onClick={() => onChange({ ...filters, company: null })}>
                All
              </Pill>
              {COMPANIES.map(({ name, logo }) => {
                const on = companies.includes(name)
                return (
                  <button
                    key={name}
                    title={name}
                    aria-pressed={on}
                    onClick={() => toggleCompany(name)}
                    className={`px-2.5 py-1 rounded-full transition-colors ${
                      on ? "bg-forest-green ring-2 ring-forest-green/20" : "bg-mist-100 hover:bg-blush-pink"
                    }`}
                  >
                    <img src={logo} alt={name} className="h-4 object-contain" />
                  </button>
                )
              })}
            </div>
          </Group>
          <ExcludedRow label="Not able to scrape" labelClassName="text-ink-900/60" companies={UNSCRAPABLE_COMPANIES} />
          <ExcludedRow label="Fully leased" companies={FULLY_LEASED_COMPANIES} />
        </div>
      </Chip>

      {hasAnyFilter && (
        <button
          onClick={() => { onChange(DEFAULT_FILTERS); setOpen(null) }}
          className="h-9 px-4 rounded-full text-xs font-semibold text-ink-900/60 hover:text-ink-900 bg-warm-ivory/95 backdrop-blur border border-mist-100 hover:border-forest-green shadow-[0_2px_10px_-4px_rgba(53,20,11,0.16)] transition-colors whitespace-nowrap"
        >
          Clear all
        </button>
      )}

      {/* Result count, mirroring Expedia's "34 properties" pill. Holds its last
          value while a refetch is in flight so the row does not jump. */}
      {resultCount != null && (
        <span
          className={`h-9 inline-flex items-center px-4 rounded-full text-xs font-bold bg-forest-green text-warm-ivory shadow-[0_2px_10px_-4px_rgba(53,20,11,0.2)] whitespace-nowrap transition-opacity ${
            loading ? "opacity-50" : "opacity-100"
          }`}
        >
          {resultCount.toLocaleString()} {resultCount === 1 ? "listing" : "listings"}
        </span>
      )}

      {trailing}
    </div>
  )
}

// Muted, non-clickable chips for companies we can't include — same treatment as
// FilterBar's, so the Map's Source dropdown tells the same coverage story.
function ExcludedRow({ label, labelClassName = "text-neutral-400", companies }: {
  label: string
  labelClassName?: string
  companies: ExcludedCompany[]
}) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
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
