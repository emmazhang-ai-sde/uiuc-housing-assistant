"use client"

import { useState } from "react"
import { Filters } from "@/lib/api"
import { COMPANIES } from "@/lib/companies"

type Props = {
  filters: Filters
  onChange: (f: Filters) => void
  onInteract?: () => void
}

const BED_OPTIONS: { label: string; value: number | null }[] = [
  { label: "Any",    value: null },
  { label: "Studio", value: 0 },   // stored as beds=0 in Chroma; label kept friendly
  { label: "1",      value: 1 },
  { label: "2",      value: 2 },
  { label: "3",      value: 3 },
  { label: "4+",     value: 4 },   // backend uses $gte 4 for this case
]

export default function FilterPanel({ filters, onChange, onInteract }: Props) {
  const [bedsTouched, setBedsTouched] = useState(false)
  const [availabilityTouched, setAvailabilityTouched] = useState(false)
  const [bufferTouched, setBufferTouched] = useState(false)
  const [sourceTouched, setSourceTouched] = useState(false)

  function clearFilters() {
    setBedsTouched(false)
    setAvailabilityTouched(false)
    setBufferTouched(false)
    setSourceTouched(false)
    onChange({
      beds: null,
      available_only: null,
      max_price_per_bed: null,
      company: null,
      buffer_type: "percent",
      buffer_value: 15,
    })
  }

  function handleChange(nextFilters: Filters) {
    onInteract?.()
    onChange(nextFilters)
  }

  function toggleBed(value: number | null) {
    setBedsTouched(true)

    if (value === null) {
      handleChange({ ...filters, beds: null })
      return
    }

    const selectedBeds = filters.beds ?? []
    const nextBeds = selectedBeds.includes(value)
      ? selectedBeds.filter(bed => bed !== value)
      : [...selectedBeds, value]

    handleChange({ ...filters, beds: nextBeds.length ? nextBeds : null })
  }

  return (
    <div className="px-6 pt-3">
      <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] px-5 py-3 flex flex-col gap-2 text-sm">

        <div className="grid grid-cols-[1.35fr_1fr_1.1fr] gap-6 w-full">
          <div className="flex flex-col gap-2 min-w-0">
            {/* Beds */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="w-16 text-neutral-400 text-xs font-medium shrink-0">Beds</span>
              <div className="flex gap-1">
                {BED_OPTIONS.map(({ label, value }) => {
                  const active = value === null
                    ? filters.beds === null && bedsTouched
                    : (filters.beds ?? []).includes(value)
                  return (
                    <button
                      key={label}
                      onClick={() => toggleBed(value)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        active
                          ? "bg-black text-white"
                          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Availability */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="w-16 text-neutral-400 text-xs font-medium shrink-0">Availability</span>
              <button
                onClick={() => {
                  setAvailabilityTouched(true)
                  handleChange({ ...filters, available_only: filters.available_only ? null : true })
                }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors w-[124px] text-center shrink-0 ${
                  filters.available_only || availabilityTouched
                    ? "bg-black text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                {filters.available_only ? "Available only ✓" : "All listings"}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2 min-w-0">
            {/* Max price/bed */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="w-20 text-neutral-400 text-xs font-medium shrink-0">Max $/bed</span>
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
                    const value = e.target.value.replace(/\D/g, "").slice(0, 4)
                    handleChange({
                      ...filters,
                      max_price_per_bed: value ? Number(value) : null,
                    })
                  }}
                  className="pl-6 pr-2 py-1 w-16 rounded-full text-xs text-neutral-700 bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-glow-300"
                />
              </div>
            </div>

            {/* Buffer — always visible; disabled until a price is set */}
            <div className={`flex items-center gap-2 shrink-0 transition-opacity ${filters.max_price_per_bed === null ? "opacity-35 pointer-events-none" : ""}`}>
              <span className="w-20 text-neutral-400 text-xs font-medium shrink-0">Buffer</span>
              <div className="flex gap-1 items-center">
                {([ ["percent", "+%"], ["fixed", "+$"], ["exact", "exact"] ] as const).map(([type, label]) => {
                  const active = bufferTouched && (filters.buffer_type ?? "percent") === type
                  return (
                    <button
                      key={type}
                      onClick={() => {
                        setBufferTouched(true)
                        handleChange({
                          ...filters,
                          buffer_type: type,
                          buffer_value: type === "percent" ? 15 : type === "fixed" ? 50 : null,
                        })
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        active
                          ? "bg-black text-white"
                          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
                {(filters.buffer_type ?? "percent") !== "exact" && (
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={3}
                    value={filters.buffer_value ?? ""}
                    onChange={e => {
                      const value = e.target.value.replace(/\D/g, "").slice(0, 3)
                      handleChange({ ...filters, buffer_value: value ? Number(value) : null })
                    }}
                    className="w-11 px-2.5 py-1 rounded-full text-xs text-neutral-700 bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-glow-300"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 items-end min-w-0">
            {/* Source */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-neutral-400 text-xs font-medium shrink-0">Source</span>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    setSourceTouched(true)
                    handleChange({ ...filters, company: null })
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    filters.company === null && sourceTouched
                      ? "bg-black text-white"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                >
                  All
                </button>
                {COMPANIES.map(({ name, logo }) => {
                  const active = filters.company === name
                  return (
                    <button
                      key={name}
                      onClick={() => {
                        setSourceTouched(true)
                        handleChange({ ...filters, company: active ? null : name })
                      }}
                      title={name}
                      className={`px-2.5 py-1 rounded-full transition-colors ${
                        active
                          ? "bg-black"
                          : "bg-neutral-100 hover:bg-neutral-200"
                      }`}
                    >
                      <img src={logo} alt={name} className="h-4 object-contain" />
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Clear */}
        <div className="flex justify-end">
          <button
            onClick={clearFilters}
            className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors underline-offset-2 hover:underline whitespace-nowrap"
          >
            Clear filters
          </button>
        </div>
      </div>
    </div>
  )
}
