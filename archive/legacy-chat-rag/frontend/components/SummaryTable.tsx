"use client"

import { forwardRef, useState } from "react"
import { Listing, Filters } from "@/lib/api"
import { COMPANY_LOGOS } from "@/lib/companies"
import { availabilitySortValue, availabilityStatus, bedsLabel, splitAvailabilityLines } from "@/lib/availability"

// Matches ListingCardV2's badge language so a listing's status reads the same
// in cards, table rows, and the detail drawer.
const STATUS_BADGE_STYLE = {
  now:         "bg-mint-400 text-ink-900",
  available:   "bg-mint-200 text-ink-900",
  unavailable: "bg-mist-100 text-neutral-500",
} as const

type SortKey = "price" | "beds" | "availability" | "walk"
type SortDir = "asc" | "desc"

export type TableRow = { listing: Listing; walkMins: number | null; driveMins: number | null }

function priceStr(low: number | null | undefined, high: number | null | undefined): string {
  if (low == null) return "—"
  if (high == null || low === high) return `$${low.toLocaleString()}`
  return `$${low.toLocaleString()}–$${high?.toLocaleString()}`
}

function priceValue(l: Listing): number {
  return l.price_per_bed_low ?? Infinity
}

function bedsStr(beds: number, unitType: string): string {
  return bedsLabel(beds, unitType)
}

// Short label for table cells and exports when a listing carries a price_note
// (e.g. Bankier, whose prices can't be scraped) instead of numbers.
const MANUAL_PRICE_LABEL = "Manual search required"

function perBedPriceStr(l: Listing): string {
  if (l.price_note) return MANUAL_PRICE_LABEL
  return priceStr(l.price_per_bed_low, l.price_per_bed_high)
}

function totalPriceStr(l: Listing): string {
  if (l.price_note) return MANUAL_PRICE_LABEL
  return priceStr(l.price_total_low, l.price_total_high)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function tableRowsHtml(listings: Listing[]): string {
  const headers = ["#", "Source", "Address", "Unit", "Beds", "Price/bed", "Total price", "Availability", "URL"]
  const rows = listings.map((listing, index) => [
    String(index + 1),
    listing.company,
    listing.address,
    listing.unit_type,
    bedsStr(listing.beds, listing.unit_type),
    perBedPriceStr(listing),
    totalPriceStr(listing),
    listing.availability,
    listing.url,
  ])

  return `
    <table>
      <thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `
}

export function tableRowsTsv(listings: Listing[]): string {
  const headers = ["#", "Source", "Address", "Unit", "Beds", "Price/bed", "Total price", "Availability", "URL"]
  const rows = listings.map((listing, index) => [
    String(index + 1),
    listing.company,
    listing.address,
    listing.unit_type,
    bedsStr(listing.beds, listing.unit_type),
    perBedPriceStr(listing),
    totalPriceStr(listing),
    listing.availability,
    listing.url,
  ])

  return [headers, ...rows]
    .map(row => row.map(cell => cell.replace(/\t/g, " ").replace(/\n/g, " ")).join("\t"))
    .join("\n")
}

function SortArrow({ col, sortKey, dir }: { col: SortKey; sortKey: SortKey; dir: SortDir }) {
  if (col !== sortKey) return null
  return <span className="ml-1">{dir === "asc" ? "↑" : "↓"}</span>
}

const SummaryTable = forwardRef<HTMLDivElement, {
  listings: TableRow[]
  maxPricePerBed: number | null
  filters: Filters
}>(function SummaryTable({
  listings,
  maxPricePerBed,
  filters,
}, tableRef) {
  const [sortKey, setSortKey] = useState<SortKey>("price")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  if (!listings.length) return null

  const hasWalk = listings.some(r => r.walkMins != null)

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
      diff = priceValue(a.listing) - priceValue(b.listing)
    } else if (sortKey === "beds") {
      diff = a.listing.beds - b.listing.beds
    } else if (sortKey === "availability") {
      diff = availabilitySortValue(a.listing.availability) - availabilitySortValue(b.listing.availability)
    } else if (sortKey === "walk") {
      if (a.walkMins == null && b.walkMins == null) diff = 0
      else if (a.walkMins == null) return 1
      else if (b.walkMins == null) return -1
      else diff = a.walkMins - b.walkMins
    }
    if (diff === 0) diff = priceValue(a.listing) - priceValue(b.listing)
    return sortDir === "asc" ? diff : -diff
  })

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-mist-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] bg-white">
      <div ref={tableRef} className="overflow-hidden">
        <table className="w-full table-fixed text-left border-collapse text-sm text-neutral-600">
          <colgroup>
            <col className="w-[4%]" />
            <col className="w-[10%]" />
            <col className={hasWalk ? "w-[22%]" : "w-[26%]"} />
            <col className={hasWalk ? "w-[18%]" : "w-[22%]"} />
            <col className="w-[8%]" />
            <col className={hasWalk ? "w-[11%]" : "w-[12%]"} />
            <col className={hasWalk ? "w-[16%]" : "w-[18%]"} />
            {hasWalk && <col className="w-[11%]" />}
          </colgroup>
          <thead>
            <tr className="text-[11px] font-bold uppercase text-neutral-400 tracking-wider">
              <th className="px-3 py-3.5 bg-mist-50 whitespace-nowrap text-center">#</th>
              <th className="px-3 py-3.5 bg-mist-50 whitespace-nowrap">Source</th>
              <th className="px-3 py-3.5 bg-mist-50 whitespace-nowrap">Address</th>
              <th className="px-3 py-3.5 bg-mist-50 whitespace-nowrap">Unit</th>
              <th
                className="px-3 py-3.5 bg-mist-50 whitespace-nowrap cursor-pointer select-none hover:text-neutral-600 transition-colors"
                onClick={() => handleSort("beds")}
              >
                Beds <SortArrow col="beds" sortKey={sortKey} dir={sortDir} />
              </th>
              <th
                className="px-3 py-3.5 bg-mist-50 whitespace-nowrap cursor-pointer select-none hover:text-neutral-600 transition-colors"
                onClick={() => handleSort("price")}
              >
                Price/bed <SortArrow col="price" sortKey={sortKey} dir={sortDir} />
              </th>
              <th
                className="px-3 py-3.5 bg-mist-50 whitespace-nowrap cursor-pointer select-none hover:text-neutral-600 transition-colors"
                onClick={() => handleSort("availability")}
              >
                Availability <SortArrow col="availability" sortKey={sortKey} dir={sortDir} />
              </th>
              {hasWalk && (
                <th
                  className="px-3 py-3.5 bg-mist-50 whitespace-nowrap cursor-pointer select-none hover:text-neutral-600 transition-colors"
                  onClick={() => handleSort("walk")}
                >
                  Walk <SortArrow col="walk" sortKey={sortKey} dir={sortDir} />
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-mist-100">
            {sorted.map(({ listing: l, walkMins }, i) => {
              const statusStyle = STATUS_BADGE_STYLE[availabilityStatus(l.availability)]
              const overBudget =
                maxPricePerBed !== null &&
                l.price_per_bed_high !== null &&
                l.price_per_bed_high > maxPricePerBed
              return (
                <tr key={i} className="bg-white hover:bg-mist-50 transition-colors">
                  <td className="px-3 py-3.5 text-center text-xs text-neutral-400 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-3.5">
                    {COMPANY_LOGOS[l.company]
                      ? <img src={COMPANY_LOGOS[l.company]} alt={l.company} className="h-6 max-w-full object-contain object-left" />
                      : <span className="text-neutral-500">{l.company}</span>
                    }
                  </td>
                  <td className="px-3 py-3.5">
                    <a href={l.url} target="_blank" rel="noopener noreferrer"
                      className="text-neutral-600 hover:text-ink-900 underline decoration-neutral-300 hover:decoration-mint-400 font-medium transition-colors break-words">
                      {l.address}
                    </a>
                  </td>
                  <td className="px-3 py-3.5 italic break-words">{l.unit_type}</td>
                  <td className="px-3 py-3.5">{l.beds}</td>
                  <td className="px-3 py-3.5 font-bold text-base text-ink-900">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {l.price_note
                      ? <span className="text-xs font-medium text-neutral-500" title={l.price_note}>{MANUAL_PRICE_LABEL}</span>
                      : <span>{priceStr(l.price_per_bed_low, l.price_per_bed_high)}</span>}
                    {overBudget && (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FF465A1A] text-[#FF465A]">
                        over budget
                      </span>
                    )}
                    </div>
                  </td>
                  <td className="px-3 py-3.5">
                    <span className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${statusStyle}`}>
                      {splitAvailabilityLines(l.availability).map((part, j) => (
                        <span key={j} className="block">
                          {part}
                        </span>
                      ))}
                    </span>
                  </td>
                  {hasWalk && (
                    <td className="px-3 py-3.5 text-xs text-neutral-500 tabular-nums">
                      {walkMins != null ? `~${walkMins} min` : "—"}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
})

export default SummaryTable