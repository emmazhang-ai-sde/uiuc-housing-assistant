"use client"

import { useState } from "react"
import { Listing } from "@/lib/api"

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

export default function SummaryTable({ listings }: { listings: Listing[] }) {
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
      <div className="bg-slate-50 px-5 py-3 border-b border-slate-200">
        <h3 className="font-bold text-slate-800 text-sm">Summary</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm text-slate-600">
          <thead>
            <tr className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
              <th className="px-5 py-3 border-b border-slate-200 bg-white whitespace-nowrap">Company</th>
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
              <th className="px-5 py-3 border-b border-slate-200 bg-white whitespace-nowrap">Link</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((l, i) => {
              const leased = l.availability.toLowerCase() === "leased"
              return (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5 whitespace-nowrap text-slate-500">{l.company}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap">{l.address}</td>
                  <td className="px-5 py-3.5 italic whitespace-nowrap">{l.unit_type}</td>
                  <td className="px-5 py-3.5">{l.beds}</td>
                  <td className="px-5 py-3.5 font-medium text-slate-900 whitespace-nowrap">
                    {priceStr(l.price_per_bed_low, l.price_per_bed_high)}
                  </td>
                  <td className={`px-5 py-3.5 whitespace-nowrap ${leased ? "text-slate-400" : ""}`}>
                    {l.availability}
                  </td>
                  <td className="px-5 py-3.5">
                    <a href={l.url} target="_blank" rel="noopener noreferrer"
                      className="text-blue-600 font-semibold hover:underline">
                      View →
                    </a>
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
