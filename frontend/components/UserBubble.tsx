import { Filters } from "@/lib/api"
import { COMPANIES } from "@/lib/companies"

const BED_OPTIONS: { label: string; value: number | null }[] = [
  { label: "Any",    value: null },
  { label: "Studio", value: 0 },
  { label: "1",      value: 1 },
  { label: "2",      value: 2 },
  { label: "3",      value: 3 },
  { label: "4+",     value: 4 },
]

const BUFFER_OPTIONS = [
  ["percent", "+%"],
  ["fixed", "+$"],
  ["exact", "exact"],
] as const

function ReadOnlyFilterSnapshot({ filters }: { filters: Filters }) {
  const selectedBeds = filters.beds ?? []
  const bufferType = filters.buffer_type ?? "percent"
  const bufferValue = filters.buffer_value ?? (bufferType === "fixed" ? 50 : 15)

  return (
    <div className="w-full rounded-2xl bg-white px-5 py-3 text-sm shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)]">
      <div className="grid grid-cols-[1.35fr_1fr_1.1fr] gap-6 w-full">
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <span className="w-16 text-neutral-400 text-xs font-medium shrink-0">Beds</span>
            <div className="flex gap-1">
              {BED_OPTIONS.map(({ label, value }) => {
                const active = value !== null && selectedBeds.includes(value)
                return (
                  <span
                    key={label}
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      active
                        ? "bg-black text-white"
                        : "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {label}
                  </span>
                )
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="w-16 text-neutral-400 text-xs font-medium shrink-0">Availability</span>
            <span className={`px-3 py-1 rounded-full text-xs font-medium w-[124px] text-center shrink-0 ${
              filters.available_only
                ? "bg-black text-white"
                : "bg-neutral-100 text-neutral-600"
            }`}>
              {filters.available_only ? "Available only ✓" : "All listings"}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <span className="w-20 text-neutral-400 text-xs font-medium shrink-0">Max $/bed</span>
            <span className="inline-flex w-16 items-center gap-1 rounded-full bg-neutral-100 py-1 pl-3 pr-2 text-xs text-neutral-700">
              <span className="text-neutral-400">$</span>
              <span>{filters.max_price_per_bed ?? "900"}</span>
            </span>
          </div>

          <div className={`flex items-center gap-2 shrink-0 ${filters.max_price_per_bed === null ? "opacity-35" : ""}`}>
            <span className="w-20 text-neutral-400 text-xs font-medium shrink-0">Buffer</span>
            <div className="flex gap-1 items-center">
              {BUFFER_OPTIONS.map(([type, label]) => {
                const active = bufferType === type
                return (
                  <span
                    key={type}
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      active
                        ? "bg-black text-white"
                        : "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {label}
                  </span>
                )
              })}
              {bufferType !== "exact" && (
                <span className="w-11 rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700">
                  {bufferValue}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 items-end min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-neutral-400 text-xs font-medium shrink-0">Source</span>
            <div className="flex gap-1">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                filters.company === null
                  ? "bg-neutral-100 text-neutral-600"
                  : "bg-black text-white"
              }`}>
                All
              </span>
              {COMPANIES.map(({ name, logo }) => {
                const active = filters.company === name
                return (
                  <span
                    key={name}
                    title={name}
                    className={`px-2.5 py-1 rounded-full ${
                      active ? "bg-black" : "bg-neutral-100"
                    }`}
                  >
                    <img src={logo} alt={name} className="h-4 object-contain" />
                  </span>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function UserBubble({ text, filters }: { text: string; filters: Filters }) {
  return (
    <div className="flex justify-end items-start gap-3 mt-10 mb-4">
      <div className="flex max-w-[80%] flex-col items-end gap-3">
        <ReadOnlyFilterSnapshot filters={filters} />
        <div className="bg-neutral-900 rounded-3xl rounded-tr-lg px-5 py-3.5 text-[15px] text-white font-medium leading-relaxed">
          {text}
        </div>
      </div>
      <div className="w-8 h-8 bg-neutral-200 rounded-full flex items-center justify-center shrink-0 text-sm">
        🌽
      </div>
    </div>
  )
}
