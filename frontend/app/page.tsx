"use client"

import { useState, useEffect } from "react"
import AppHeader from "@/components/AppHeader"
import FilterBar from "@/components/FilterBar"
import ListingGrid from "@/components/ListingGrid"
import { fetchListingsPage, fetchAllListings, Listing, Filters, DEFAULT_FILTERS } from "@/lib/api"
import PropertyDrawer from "@/components/PropertyDrawer"

const CATALOG_PAGE_SIZE = 24

export default function Home() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null)

  // Browse-all catalog. Sorted by beds on the backend. With no filters selected there
  // can be hundreds of matches, so we paginate to avoid dumping everything into the DOM
  // at once. Once the user narrows things down with a filter, the result set is small
  // enough to just load in full and scroll.
  const hasAnyFilter =
    !!filters.beds?.length ||
    filters.max_price_per_bed != null ||
    !!filters.property_type ||
    filters.availability_window != null ||
    !!filters.company

  const [catalogListings, setCatalogListings] = useState<Listing[]>([])
  const [catalogTotal, setCatalogTotal]       = useState(0)
  const [catalogPage, setCatalogPage]         = useState(1)
  const [catalogLoading, setCatalogLoading]   = useState(true)

  useEffect(() => {
    let cancelled = false
    setCatalogLoading(true)

    const request = hasAnyFilter
      ? fetchAllListings(filters).then(listings => ({ listings, total: listings.length }))
      : fetchListingsPage(filters, 1, CATALOG_PAGE_SIZE)

    request
      .then(({ listings, total }) => {
        if (cancelled) return
        setCatalogListings(listings)
        setCatalogTotal(total)
        setCatalogPage(1)
      })
      .catch(() => {
        if (cancelled) return
        setCatalogListings([])
        setCatalogTotal(0)
      })
      .finally(() => { if (!cancelled) setCatalogLoading(false) })
    return () => { cancelled = true }
  }, [filters, hasAnyFilter])

  function goToCatalogPage(page: number) {
    setCatalogLoading(true)
    fetchListingsPage(filters, page, CATALOG_PAGE_SIZE)
      .then(({ listings, total }) => {
        setCatalogListings(listings)
        setCatalogTotal(total)
        setCatalogPage(page)
      })
      .catch(() => {})
      .finally(() => setCatalogLoading(false))
  }

  return (
    <div className="flex flex-col h-screen bg-neutral-100 overflow-hidden print:h-auto print:overflow-visible">
      <AppHeader />
      <div className="flex flex-1 min-h-0">
        {/* Filter block — same design as the Map view's filter panel */}
        <div className="shrink-0 overflow-y-auto p-4 print:hidden">
          <FilterBar filters={filters} onChange={setFilters} />
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-6 print:overflow-visible">
          <div className="max-w-7xl mx-auto">
            <BrowseCatalog
              listings={catalogListings}
              total={catalogTotal}
              page={catalogPage}
              pageSize={CATALOG_PAGE_SIZE}
              loading={catalogLoading}
              paginated={!hasAnyFilter}
              filters={filters}
              onPageChange={goToCatalogPage}
              onSelect={setSelectedListing}
            />
          </div>
        </div>
      </div>
      <PropertyDrawer listing={selectedListing} onClose={() => setSelectedListing(null)} />
    </div>
  )
}

function BrowseCatalog({
  listings,
  total,
  page,
  pageSize,
  loading,
  paginated,
  filters,
  onPageChange,
  onSelect,
}: {
  listings: Listing[]
  total: number
  page: number
  pageSize: number
  loading: boolean
  paginated: boolean
  filters: Filters
  onPageChange: (page: number) => void
  onSelect: (listing: Listing) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div>
      <div className="flex items-center justify-between mb-3 pt-4">
        <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">
          {total.toLocaleString()} listings, sorted by beds
        </span>
      </div>

      {loading && listings.length === 0 ? (
        <div className="text-center text-sm text-neutral-400 py-16">Loading listings…</div>
      ) : (
        <ListingGrid
          entries={listings.map(listing => ({ listing }))}
          filters={filters}
          columns={4}
          onSelect={onSelect}
          className={`transition-opacity ${loading ? "opacity-50" : ""}`}
        />
      )}

      {/* Pagination — only shown when browsing the unfiltered catalog; a filtered
          result set is small enough to just load in full and scroll through. */}
      {paginated && (
        <div className="flex items-center justify-center gap-4 mt-6 pb-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1 || loading}
            className="px-4 py-2 rounded-full text-xs font-semibold bg-white text-neutral-700 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← Previous
          </button>
          <span className="text-xs text-neutral-400 whitespace-nowrap">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages || loading}
            className="px-4 py-2 rounded-full text-xs font-semibold bg-white text-neutral-700 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
