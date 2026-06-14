"use client"

import { useState } from "react"
import ListingCard from "./ListingCard"
import SummaryTable from "./SummaryTable"
import { Listing } from "@/lib/api"

type View = "cards" | "table"

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

  return (
    <div className="flex items-start gap-3 my-4">
      <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center shrink-0 text-sm mt-1">
        🏠
      </div>
      <div className="flex-1 min-w-0 space-y-4">
        {answer && listings.length === 0 && (
          <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm text-[15px] leading-relaxed text-slate-700">
            {answer}
          </div>
        )}

        {listings.length > 0 && (
          <>
            {/* Header row: summary text + view toggle */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{answer}</p>
              <div className="flex items-center gap-1 ml-4 shrink-0 bg-slate-100 rounded-lg p-0.5">
                <button
                  onClick={() => setView("cards")}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    view === "cards"
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Cards
                </button>
                <button
                  onClick={() => setView("table")}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    view === "table"
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Table
                </button>
              </div>
            </div>

            {/* Cards view */}
            {view === "cards" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {listings.map((l, i) => <ListingCard key={i} listing={l} />)}
              </div>
            )}

            {/* Table view */}
            {view === "table" && (
              <SummaryTable listings={listings} maxPricePerBed={maxPricePerBed} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
