"use client"

import { Fragment, useRef, useState } from "react"
import dynamic from "next/dynamic"
import ListingCard from "./ListingCard"
import SummaryTable from "./SummaryTable"
import { Listing, Filters } from "@/lib/api"
import { downloadElementPng } from "@/lib/exportDom"

const MapView = dynamic(() => import("./MapView"), { ssr: false })

type View = "cards" | "table" | "map"

export default function AssistantMessage({
  answer,
  listings,
  maxPricePerBed,
  query,
  filters,
  onSelect,
}: {
  answer: string
  listings: Listing[]
  maxPricePerBed: number | null
  query: string
  filters: Filters
  onSelect?: (listing: Listing) => void
}) {
  const [view, setView] = useState<View>("cards")
  const [cardSaveStatus, setCardSaveStatus] = useState<"idle" | "saving" | "failed">("idle")
  const cardsRef = useRef<HTMLDivElement>(null)
  const answerBubble = answer ? (
    <div className="w-fit max-w-3xl bg-neutral-900 rounded-3xl rounded-tl-lg px-5 py-3.5 text-[15px] font-medium leading-relaxed text-white">
      {answer}
    </div>
  ) : null

  async function saveCardImages() {
    const cardGrid = cardsRef.current
    if (!cardGrid) return

    const cards = Array.from(cardGrid.children) as HTMLElement[]
    const chunks: HTMLElement[][] = []
    for (let i = 0; i < cards.length; i += 9) {
      chunks.push(cards.slice(i, i + 9))
    }

    setCardSaveStatus("saving")
    try {
      for (let i = 0; i < chunks.length; i += 1) {
        const exportGrid = document.createElement("div")
        exportGrid.style.position = "fixed"
        exportGrid.style.left = "-10000px"
        exportGrid.style.top = "0"
        exportGrid.style.width = "1120px"
        exportGrid.style.padding = "16px"
        exportGrid.style.background = "#f5f5f5"
        exportGrid.style.display = "grid"
        exportGrid.style.gridTemplateColumns = "repeat(3, 1fr)"
        exportGrid.style.gap = "12px"

        chunks[i].forEach(card => {
          exportGrid.appendChild(card.cloneNode(true))
        })

        document.body.appendChild(exportGrid)
        try {
          await downloadElementPng(exportGrid, `uiuc-housing-cards-${i + 1}.png`)
        } finally {
          exportGrid.remove()
        }
      }
      setCardSaveStatus("idle")
    } catch {
      setCardSaveStatus("failed")
      window.setTimeout(() => setCardSaveStatus("idle"), 1600)
    }
  }

  return (
    <div className="flex items-start gap-3 my-4 pr-11">
      <div className="w-8 h-8 bg-neutral-200 rounded-full flex items-center justify-center shrink-0 text-sm mt-1">
        🏠
      </div>
      <div className="flex-1 min-w-0 space-y-4">
        {listings.length === 0 && answerBubble}

        {listings.length > 0 && (
          <>
            <SearchSummary count={listings.length} filters={filters} query={query} />

            {/* View controls */}
            <div className="flex justify-end">
              <div className="flex items-center gap-2">
                {view === "cards" && listings.length > 0 && (
                  <button
                    onClick={saveCardImages}
                    disabled={cardSaveStatus === "saving"}
                    className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {cardSaveStatus === "saving" ? "Saving cards" : cardSaveStatus === "failed" ? "Save failed" : "Save cards PNG"}
                  </button>
                )}
                <div className="flex items-center gap-1 bg-neutral-100 rounded-full p-0.5">
                  <button
                    onClick={() => setView("cards")}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      view === "cards"
                        ? "bg-white text-neutral-900 shadow-[0_1px_4px_rgba(0,0,0,0.08)]"
                        : "text-neutral-500 hover:text-neutral-700"
                    }`}
                  >
                    Cards
                  </button>
                <button
                  onClick={() => setView("table")}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    view === "table"
                      ? "bg-white text-neutral-900 shadow-[0_1px_4px_rgba(0,0,0,0.08)]"
                      : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  Table
                </button>
                <button
                  onClick={() => setView("map")}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    view === "map"
                      ? "bg-white text-neutral-900 shadow-[0_1px_4px_rgba(0,0,0,0.08)]"
                      : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  Map
                </button>
                </div>
              </div>
            </div>

            {/* Cards view */}
            {view === "cards" && (
              <div ref={cardsRef} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {listings.map((l, i) => <ListingCard key={i} listing={l} maxPricePerBed={maxPricePerBed} onSelect={onSelect} />)}
              </div>
            )}

            {/* Table view */}
            {view === "table" && (
              <SummaryTable listings={listings} maxPricePerBed={maxPricePerBed} />
            )}

            {/* Map view */}
            {view === "map" && <MapView listings={listings} />}
          </>
        )}
      </div>
    </div>
  )
}

function SearchSummary({
  count,
  filters,
  query,
}: {
  count: number
  filters: Filters
  query: string
}) {
  function formatBeds(beds: number[] | null): string {
    if (!beds || beds.length === 0) return "Any"
    const sorted = [...beds].sort((a, b) => a - b)
    const labels = sorted.map(b => {
      if (b === 0) return "Studio"
      if (b >= 4) return "4+"
      return `${b}`
    })
    return labels.join(", ") + (sorted.every(b => b === 0) ? "" : sorted[0] > 0 ? " bed" : "")
  }

  function formatBudget(): string {
    if (!filters.max_price_per_bed) return "No limit"
    const base = `≤ $${filters.max_price_per_bed.toLocaleString()}/bed`
    if (filters.buffer_type === "exact") return `${base} (exact)`
    if (filters.buffer_type === "percent" && filters.buffer_value)
      return `${base}  +${filters.buffer_value}%`
    if (filters.buffer_type === "fixed" && filters.buffer_value)
      return `${base}  +$${filters.buffer_value}`
    return base
  }

  const otherParts: string[] = []
  if (filters.available_only) otherParts.push("Available listings only")
  if (filters.company) otherParts.push(filters.company)

  const rows: { label: string; value: string }[] = [
    { label: "Bedroom",  value: formatBeds(filters.beds) },
    { label: "Budget",   value: formatBudget() },
    { label: "Query",    value: `"${query}"` },
    ...(otherParts.length ? [{ label: "Filter", value: otherParts.join(" · ") }] : []),
  ]

  return (
    <div className="w-fit max-w-3xl rounded-3xl rounded-tl-lg bg-neutral-900 px-5 py-3.5 text-sm leading-relaxed text-white">
      <div className="font-semibold text-white">
        {count} unit{count !== 1 ? "s" : ""} found
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {rows.map(r => (
          <Fragment key={r.label}>
            <dt className="font-medium text-neutral-400 whitespace-nowrap">{r.label}</dt>
            <dd className="text-neutral-200">{r.value}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  )
}
