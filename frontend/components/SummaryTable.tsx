"use client"

import { useRef, useState } from "react"
import { Listing } from "@/lib/api"
import { COMPANY_LOGOS } from "@/lib/companies"
import { availabilitySortValue, availabilityStatus, bedsLabel, splitAvailabilityLines } from "@/lib/availability"
import { downloadElementPng } from "@/lib/exportDom"

const STATUS_BADGE_STYLE = {
  now:         "bg-now-100 text-neutral-900",
  available:   "bg-[#C7DDB5] text-neutral-900",
  unavailable: "bg-neutral-100 text-black",
} as const

type SortKey = "price" | "beds" | "availability"
type SortDir = "asc" | "desc"

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

function totalPriceStr(l: Listing): string {
  return priceStr(l.price_total_low, l.price_total_high)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function tableRowsHtml(listings: Listing[]): string {
  const headers = ["#", "Source", "Address", "Unit", "Beds", "Price/bed", "Total price", "Availability", "URL"]
  const rows = listings.map((listing, index) => [
    String(index + 1),
    listing.company,
    listing.address,
    listing.unit_type,
    bedsStr(listing.beds, listing.unit_type),
    priceStr(listing.price_per_bed_low, listing.price_per_bed_high),
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

function tableRowsTsv(listings: Listing[]): string {
  const headers = ["#", "Source", "Address", "Unit", "Beds", "Price/bed", "Total price", "Availability", "URL"]
  const rows = listings.map((listing, index) => [
    String(index + 1),
    listing.company,
    listing.address,
    listing.unit_type,
    bedsStr(listing.beds, listing.unit_type),
    priceStr(listing.price_per_bed_low, listing.price_per_bed_high),
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

export default function SummaryTable({
  listings,
  maxPricePerBed,
}: {
  listings: Listing[]
  maxPricePerBed: number | null  // Phase 6: used to badge over-budget rows
}) {
  const [sortKey, setSortKey] = useState<SortKey>("price")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle")
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "failed">("idle")
  const tableRef = useRef<HTMLDivElement>(null)

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
    } else if (sortKey === "beds") {
      diff = a.beds - b.beds
    } else {
      diff = availabilitySortValue(a.availability) - availabilitySortValue(b.availability)
    }
    if (diff === 0) diff = priceValue(a) - priceValue(b)
    return sortDir === "asc" ? diff : -diff
  })

  async function copyTable() {
    try {
      const html = tableRowsHtml(sorted)
      const tsv = tableRowsTsv(sorted)

      if (navigator.clipboard && "ClipboardItem" in window) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([tsv], { type: "text/plain" }),
          }),
        ])
      } else {
        await navigator.clipboard.writeText(tsv)
      }

      setCopyStatus("copied")
    } catch {
      setCopyStatus("failed")
    } finally {
      window.setTimeout(() => setCopyStatus("idle"), 1600)
    }
  }

  async function saveTableImage() {
    if (!tableRef.current) return
    setSaveStatus("saving")
    try {
      await downloadElementPng(tableRef.current, "uiuc-housing-table.png")
      setSaveStatus("idle")
    } catch {
      setSaveStatus("failed")
      window.setTimeout(() => setSaveStatus("idle"), 1600)
    }
  }

  return (
    <section className="mt-6 overflow-hidden rounded-3xl shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-100 bg-white px-3 py-2">
        <span className="text-xs font-semibold text-neutral-400">{sorted.length} rows</span>
        <div className="flex items-center gap-1">
          <button
            onClick={copyTable}
            className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-200"
          >
            {copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Copy failed" : "Copy table"}
          </button>
          <button
            onClick={saveTableImage}
            disabled={saveStatus === "saving"}
            className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saveStatus === "saving" ? "Saving" : saveStatus === "failed" ? "Save failed" : "Save PNG"}
          </button>
        </div>
      </div>
      <div ref={tableRef} className="overflow-hidden">
        <table className="w-full table-fixed text-left border-collapse text-sm text-neutral-600">
          <colgroup>
            <col className="w-[4%]" />
            <col className="w-[10%]" />
            <col className="w-[26%]" />
            <col className="w-[22%]" />
            <col className="w-[8%]" />
            <col className="w-[12%]" />
            <col className="w-[18%]" />
          </colgroup>
          <thead>
            <tr className="text-[11px] font-bold uppercase text-neutral-400 tracking-wider">
              <th className="px-3 py-3.5 bg-neutral-50 whitespace-nowrap text-center">#</th>
              <th className="px-3 py-3.5 bg-neutral-50 whitespace-nowrap">Source</th>
              <th className="px-3 py-3.5 bg-neutral-50 whitespace-nowrap">Address</th>
              <th className="px-3 py-3.5 bg-neutral-50 whitespace-nowrap">Unit</th>
              <th
                className="px-3 py-3.5 bg-neutral-50 whitespace-nowrap cursor-pointer select-none hover:text-neutral-600 transition-colors"
                onClick={() => handleSort("beds")}
              >
                Beds <SortArrow col="beds" sortKey={sortKey} dir={sortDir} />
              </th>
              <th
                className="px-3 py-3.5 bg-neutral-50 whitespace-nowrap cursor-pointer select-none hover:text-neutral-600 transition-colors"
                onClick={() => handleSort("price")}
              >
                Price/bed <SortArrow col="price" sortKey={sortKey} dir={sortDir} />
              </th>
              <th
                className="px-3 py-3.5 bg-neutral-50 whitespace-nowrap cursor-pointer select-none hover:text-neutral-600 transition-colors"
                onClick={() => handleSort("availability")}
              >
                Availability <SortArrow col="availability" sortKey={sortKey} dir={sortDir} />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {sorted.map((l, i) => {
              const statusStyle = STATUS_BADGE_STYLE[availabilityStatus(l.availability)]
              const overBudget =
                maxPricePerBed !== null &&
                l.price_per_bed_high !== null &&
                l.price_per_bed_high > maxPricePerBed
              return (
                <tr key={i} className="bg-white hover:bg-neutral-50 transition-colors">
                  <td className="px-3 py-3.5 text-center text-xs text-neutral-400 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-3.5">
                    {COMPANY_LOGOS[l.company]
                      ? <img src={COMPANY_LOGOS[l.company]} alt={l.company} className="h-6 max-w-full object-contain object-left" />
                      : <span className="text-neutral-500">{l.company}</span>
                    }
                  </td>
                  <td className="px-3 py-3.5">
                    <a href={l.url} target="_blank" rel="noopener noreferrer"
                      className="text-neutral-600 hover:text-neutral-900 underline decoration-neutral-300 hover:decoration-neutral-500 font-medium transition-colors break-words">
                      {l.address}
                    </a>
                  </td>
                  <td className="px-3 py-3.5 italic break-words">{l.unit_type}</td>
                  <td className="px-3 py-3.5">{l.beds}</td>
                  <td className="px-3 py-3.5 font-bold text-base text-neutral-900">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{priceStr(l.price_per_bed_low, l.price_per_bed_high)}</span>
                    {overBudget && (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F5BBA0] text-black">
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
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
