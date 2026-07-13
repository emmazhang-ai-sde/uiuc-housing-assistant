"use client"

import { useState, useEffect, useMemo } from "react"
import AppHeader from "@/components/AppHeader"
import FilterBar from "@/components/FilterBar"
import SummaryTable, { TableRow } from "@/components/SummaryTable"
import { fetchAllListings, Listing } from "@/lib/api"
import { useFilters } from "@/contexts/FiltersContext"
import { logEvent } from "@/lib/logEvent"

export default function TablePage() {
  const { filters, setFilters } = useFilters()
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => { logEvent("table_view") }, [])

  // Unlike the Card view, this loads the whole filtered set rather than a page of it.
  // SummaryTable sorts client-side over the rows it is handed, so paginating here would
  // make "sort by price" quietly sort only the current page — the one thing a table is for.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setFailed(false)

    fetchAllListings(filters)
      .then(rows => {
        if (cancelled) return
        setListings(rows)
      })
      .catch(() => {
        if (cancelled) return
        setListings([])
        setFailed(true)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [filters])

  // Walk times come from the Mapbox matrix the Chat view builds around a searched
  // destination. There is no destination here, so the Walk column stays out.
  const rows: TableRow[] = useMemo(
    () => listings.map(listing => ({ listing, walkMins: null, driveMins: null })),
    [listings],
  )

  return (
    <div className="relative flex flex-col h-screen bg-neutral-100 overflow-hidden print:h-auto print:overflow-visible">
      <div className="flex flex-1 min-h-0">
        {/* Filter block — positioned to match the Map and Card views' filter panel exactly */}
        <div className="shrink-0 overflow-y-auto pt-4 px-4 pb-4 print:hidden">
          <FilterBar filters={filters} onChange={setFilters} />
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 pt-24 pb-6 print:overflow-visible">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-3 pt-4">
              <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">
                {loading && !listings.length
                  ? "Loading listings…"
                  : `${listings.length.toLocaleString()} listings, click a column to sort`}
              </span>
            </div>

            {failed ? (
              <div className="text-center text-sm text-neutral-400 py-16">
                Could not load listings. Please try again.
              </div>
            ) : !loading && !listings.length ? (
              <div className="text-center text-sm text-neutral-400 py-16">
                No listings match these filters.
              </div>
            ) : (
              <div className={`transition-opacity ${loading ? "opacity-50" : ""}`}>
                <SummaryTable
                  listings={rows}
                  maxPricePerBed={filters.max_price_per_bed}
                  filters={filters}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating header pill, overlaid on top like the Chat/Map/Card views */}
      <div className="absolute top-0 inset-x-0 z-30 pointer-events-none [&_header>div]:pointer-events-auto print:hidden">
        <AppHeader />
      </div>
    </div>
  )
}
