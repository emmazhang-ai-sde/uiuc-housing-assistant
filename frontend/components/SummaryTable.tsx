"use client"

import { useState } from "react"
import { Listing } from "@/lib/api"

const COMPANY_LOGOS: Record<string, string> = {
  "Green Street Realty": "/logos/company-logo-green-street-realty.png",
  "Universities Group":  "/logos/company-logo-university-group.png",
}

type SortKey = "price" | "beds"
type SortDir = "asc" | "desc"

function priceStr(low: number | null, high: number | null): string {
  if (low === null) return "—"
  if (low === high) return `$${low.toLocaleString()}`
  return `$${low.toLocaleString()}–$${high?.toLocaleString()}`
}

function priceValue(l: Listing): number {
  return l.price_per_bed_low ?? Infinity
}

function SortArrow({ col, sortKey, dir }: { col: SortKey; sortKey: SortKey; dir: SortDir }) {
  if (col !== sortKey) return <span className="ml-1 text-slate-300">↕</span>
  return <span className="ml-1">{dir === "asc" ? "↑" : "↓"}</span>
}

export default function SummaryTable({
  listings,
  maxPricePerBed,
}: {
  listings: Listing[]
  maxPricePerBed: number | null  // Phase 6: used to badge over-budget rows
}) {
  const [sortKey, setSortKey] = useState<SortKey>("price")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  if (!listings.length) return null

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const sorted = [...listings].sort((a, b) => {
    let diff = 0
    if (sortKey === "price") {
      diff = priceValue(a) - priceValue(b)
    } else {
      diff = a.beds - b.beds
    }
    return sortDir === "asc" ? diff : -diff
  })

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm text-slate-600">
          <thead>
            <tr className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
              <th className="px-4 py-3 border-b border-slate-200 bg-white whitespace-nowrap text-center w-8">#</th>
              <th className="px-5 py-3 border-b border-slate-200 bg-white whitespace-nowrap">Source</th>
              <th className="px-5 py-3 border-b border-slate-200 bg-white whitespace-nowrap">Address</th>
              <th className="px-5 py-3 border-b border-slate-200 bg-white whitespace-nowrap">Unit</th>
              <th
                className="px-5 py-3 border-b border-slate-200 bg-white whitespace-nowrap cursor-pointer select-none hover:text-slate-600 transition-colors"
                onClick={() => handleSort("beds")}
              >
                Beds <SortArrow col="beds" sortKey={sortKey} dir={sortDir} />
              </th>
              <th
                className="px-5 py-3 border-b border-slate-200 bg-white whitespace-nowrap cursor-pointer select-none hover:text-slate-600 transition-colors"
                onClick={() => handleSort("price")}
              >
                Price/bed <SortArrow col="price" sortKey={sortKey} dir={sortDir} />
              </th>
              <th className="px-5 py-3 border-b border-slate-200 bg-white whitespace-nowrap">Availability</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((l, i) => {
              const leased = l.availability.toLowerCase() === "leased"
              const overBudget =
                maxPricePerBed !== null &&
                l.price_per_bed_high !== null &&
                l.price_per_bed_high > maxPricePerBed
              return (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3.5 text-center text-xs text-slate-400 tabular-nums">{i + 1}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    {COMPANY_LOGOS[l.company]
                      ? <img src={COMPANY_LOGOS[l.company]} alt={l.company} className="h-7 max-w-[90px] object-contain" />
                      : <span className="text-slate-500">{l.company}</span>
                    }
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <a href={l.url} target="_blank" rel="noopener noreferrer"
                      className="text-[#7B90A0] hover:text-[#556070] underline decoration-[#b0c0cc] hover:decoration-[#556070] font-medium transition-colors">
                      {l.address}
                    </a>
                  </td>
                  <td className="px-5 py-3.5 italic whitespace-nowrap">{l.unit_type}</td>
                  <td className="px-5 py-3.5">{l.beds}</td>
                  <td className="px-5 py-3.5 font-medium text-slate-900 whitespace-nowrap">
                    <span>{priceStr(l.price_per_bed_low, l.price_per_bed_high)}</span>
                    {overBudget && (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">
                        over budget
                      </span>
                    )}
                  </td>
                  <td className={`px-5 py-3.5 ${leased ? "text-slate-400" : ""}`}>
                    {l.availability.split(/(?<=[,;:!])/).map((part, j) => (
                      <span key={j} className="block whitespace-nowrap">
                        {part.trim()}
                      </span>
                    ))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
