"use client"

import { useRef, useState } from "react"
import dynamic from "next/dynamic"
import ListingCard from "./ListingCard"
import SummaryTable from "./SummaryTable"
import { Listing } from "@/lib/api"
import { downloadElementPng } from "@/lib/exportDom"

const MapView = dynamic(() => import("./MapView"), { ssr: false })

type View = "cards" | "table" | "map"

export default function AssistantMessage({
  answer,
  listings,
  maxPricePerBed,
}: {
  answer: string
  listings: Listing[]
  maxPricePerBed: number | null
}) {
  const [view, setView] = useState<View>("cards")
  const [cardSaveStatus, setCardSaveStatus] = useState<"idle" | "saving" | "failed">("idle")
  const cardsRef = useRef<HTMLDivElement>(null)

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
        {answer && listings.length === 0 && (
          <div className="bg-white rounded-3xl rounded-tl-lg px-5 py-4 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] text-[15px] leading-relaxed text-neutral-700">
            {answer}
          </div>
        )}

        {listings.length > 0 && (
          <>
            {/* Header row: summary text + view toggle */}
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-neutral-500">{answer}</p>
              <div className="flex shrink-0 items-center gap-2">
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
                {listings.map((l, i) => <ListingCard key={i} listing={l} maxPricePerBed={maxPricePerBed} />)}
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
