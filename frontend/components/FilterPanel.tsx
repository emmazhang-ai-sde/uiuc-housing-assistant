"use client"

import { Filters } from "@/lib/api"

const COMPANIES = [
  { name: "Green Street Realty", logo: "/logos/company-logo-green-street-realty.png" },
  { name: "Universities Group",  logo: "/logos/company-logo-university-group.png" },
]

type Props = {
  filters: Filters
  onChange: (f: Filters) => void
}

const BED_OPTIONS: { label: string; value: number | null }[] = [
  { label: "Any",    value: null },
  { label: "Studio", value: 0 },   // stored as beds=0 in Chroma; label kept friendly
  { label: "1",      value: 1 },
  { label: "2",      value: 2 },
  { label: "3",      value: 3 },
  { label: "4+",     value: 4 },   // backend uses $gte 4 for this case
]

export default function FilterPanel({ filters, onChange }: Props) {
  const hasAnyFilter =
    filters.beds !== null ||
    filters.available_only !== null ||
    filters.max_price_per_bed !== null ||
    filters.company !== null

  return (
    <div className="px-6 py-2.5 border-b border-slate-100 bg-slate-50 flex items-center justify-center gap-5 flex-wrap text-sm">

      {/* Beds */}
      <div className="flex items-center gap-2">
        <span className="text-slate-400 text-xs font-medium shrink-0">Beds</span>
        <div className="flex gap-1">
          {BED_OPTIONS.map(({ label, value }) => {
            const active = filters.beds === value
            return (
              <button
                key={label}
                onClick={() => onChange({ ...filters, beds: active ? null : value })}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? "bg-blue-600 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600"
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="w-px h-4 bg-slate-200 shrink-0" />

      {/* Availability */}
      <div className="flex items-center gap-2">
        <span className="text-slate-400 text-xs font-medium shrink-0">Availability</span>
        <button
          onClick={() =>
            onChange({ ...filters, available_only: filters.available_only ? null : true })
          }
          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
            filters.available_only
              ? "bg-green-600 text-white"
              : "bg-white border border-slate-200 text-slate-600 hover:border-green-300 hover:text-green-700"
          }`}
        >
          {filters.available_only ? "Available only ✓" : "All listings"}
        </button>
      </div>

      <div className="w-px h-4 bg-slate-200 shrink-0" />

      {/* Max price/bed */}
      <div className="flex items-center gap-2">
        <span className="text-slate-400 text-xs font-medium shrink-0">Max $/bed</span>
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">$</span>
          <input
            type="number"
            min={0}
            placeholder="e.g. 900"
            value={filters.max_price_per_bed ?? ""}
            onChange={e =>
              onChange({
                ...filters,
                max_price_per_bed: e.target.value ? Number(e.target.value) : null,
              })
            }
            className="pl-5 pr-2 py-1 w-24 rounded-lg border border-slate-200 text-xs text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-transparent"
          />
        </div>
      </div>

      <div className="w-px h-4 bg-slate-200 shrink-0" />

      {/* Source */}
      <div className="flex items-center gap-2">
        <span className="text-slate-400 text-xs font-medium shrink-0">Source</span>
        <div className="flex gap-1">
          <button
            onClick={() => onChange({ ...filters, company: null })}
            className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
              filters.company === null
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white border-slate-200 text-slate-600 hover:border-blue-300"
            }`}
          >
            All
          </button>
          {COMPANIES.map(({ name, logo }) => {
            const active = filters.company === name
            return (
              <button
                key={name}
                onClick={() => onChange({ ...filters, company: active ? null : name })}
                title={name}
                className={`px-2 py-1 rounded-lg border transition-colors ${
                  active
                    ? "border-blue-400 bg-blue-50"
                    : "border-slate-200 bg-white hover:border-blue-300"
                }`}
              >
                <img src={logo} alt={name} className="h-4 object-contain" />
              </button>
            )
          })}
        </div>
      </div>

      {/* Clear */}
      {hasAnyFilter && (
        <button
          onClick={() => onChange({ beds: null, available_only: null, max_price_per_bed: null, company: null })}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors underline-offset-2 hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
