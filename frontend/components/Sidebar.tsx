"use client"

import { useEffect, useState } from "react"
import { fetchStatus, DataStatus } from "@/lib/api"

export default function Sidebar({ onClear }: { onClear: () => void }) {
  const [status, setStatus] = useState<DataStatus | null>(null)

  useEffect(() => {
    fetchStatus().then(setStatus).catch(() => {})
  }, [])

  const scrapedLabel = status?.last_scraped
    ? new Date(status.last_scraped + "T00:00:00").toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "—"

  return (
    <aside className="hidden md:flex flex-col w-72 bg-slate-50 border-r border-slate-200 shrink-0 h-full">
      <div className="p-6 overflow-y-auto flex-1">
        {/* Logo + Title */}
        <div className="flex items-center gap-3 mb-7 pb-5 border-b border-slate-200">
          <div className="w-9 h-9 bg-orange-50 rounded-full flex items-center justify-center text-xl shrink-0">
            🏠
          </div>
          <div>
            <div className="font-bold text-slate-900 text-[15px] leading-none">
              UIUC Housing Assistant
            </div>
            <div className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-medium">
              Champaign-Urbana, IL
            </div>
          </div>
        </div>

        {/* About */}
        <section className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">About</h2>
          <div className="space-y-3 text-sm text-slate-600 leading-relaxed">

            {/* Data sources */}
            <div>
              <span className="font-semibold text-slate-900">Data sources:</span>
              <ul className="mt-1.5 ml-3 space-y-1.5">
                <li className="flex items-center gap-2">
                  <span className="text-blue-400 shrink-0">•</span>
                  <img src="/logos/company-logo-green-street-realty.png" alt="Green Street Realty" className="h-4 object-contain" />
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-blue-400 shrink-0">•</span>
                  <img src="/logos/company-logo-university-group.png" alt="Universities Group" className="h-4 object-contain" />
                </li>
              </ul>
            </div>

            {/* Listings */}
            <div>
              <span className="font-semibold text-slate-900">Listings:</span>
              <ul className="mt-1.5 ml-3 space-y-1">
                <li className="flex items-center gap-2">
                  <span className="text-blue-400 shrink-0">•</span>
                  {status?.listing_count != null ? `${status.listing_count} floor plans` : "—"}
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-blue-400 shrink-0">•</span>
                  {status?.property_count != null ? `${status.property_count} properties` : "—"}
                </li>
              </ul>
            </div>

            <p><span className="font-semibold text-slate-900">Last scraped:</span> {scrapedLabel}</p>
            <p><span className="font-semibold text-slate-900">Area:</span> Champaign, IL (UIUC)</p>
          </div>
        </section>

        {/* Search Tips */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Search Tips</h2>
          <ul className="space-y-3 text-sm text-slate-600">
            {[
              ['Mention bed count:', '"2BR" or "2 bedroom"'],
              ['Set a budget:', '"under $900/bed"'],
              ['Ask about location:', '"near Grainger"'],
              ['Availability:', '"August 2026"'],
            ].map(([label, example]) => (
              <li key={label} className="flex gap-2">
                <span className="text-blue-500 shrink-0">•</span>
                <span>{label} <code className="bg-slate-200 px-1 rounded text-xs">{example}</code></span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Clear chat */}
      <div className="p-4 border-t border-slate-200">
        <button
          onClick={onClear}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
        >
          🗑 Clear chat
        </button>
      </div>
    </aside>
  )
}
