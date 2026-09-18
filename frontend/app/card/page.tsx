"use client"

import { useState, useEffect } from "react"
import AppHeader from "@/components/AppHeader"
import FilterChips from "@/components/FilterChips"
import ListingGrid from "@/components/ListingGrid"
import SortButton, { DEFAULT_SORT } from "@/components/SortButton"
import { fetchListingsPage, fetchAllListings, Listing, Filters, ListingSort } from "@/lib/api"
import PropertyPanel from "@/components/PropertyPanel"
import { useFilters } from "@/contexts/FiltersContext"
import { logEvent } from "@/lib/logEvent"
import { inter } from "@/lib/fonts"

const CATALOG_PAGE_SIZE = 24

export default function Home() {
  const { filters, setFilters } = useFilters()
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null)

  // Browse-all catalog. Sorted by beds on the backend. With no filters selected there
  // can be hundreds of matches, so we paginate to avoid dumping everything into the DOM
  // at once. Once the user narrows things down with a filter, the result set is small
  // enough to just load in full and scroll.
  const hasAnyFilter =
    !!filters.beds?.length ||
    filters.min_price_per_bed != null ||
    filters.max_price_per_bed != null ||
    !!filters.property_type ||
    filters.availability_window != null ||
    !!filters.company?.length

  const [catalogListings, setCatalogListings] = useState<Listing[]>([])
  const [catalogTotal, setCatalogTotal]       = useState(0)
  const [catalogPage, setCatalogPage]         = useState(1)
  const [catalogLoading, setCatalogLoading]   = useState(true)
  const [sort, setSort]                       = useState<ListingSort>(DEFAULT_SORT)

  useEffect(() => { logEvent("card_view") }, [])

  function handleSelect(listing: Listing) {
    setSelectedListing(listing)
    logEvent("listing_view", { url: listing.url, company: listing.company, source: "card" })
  }

  useEffect(() => {
    let cancelled = false
    setCatalogLoading(true)

    const request = hasAnyFilter
      ? fetchAllListings(filters, sort).then(listings => ({ listings, total: listings.length }))
      : fetchListingsPage(filters, 1, CATALOG_PAGE_SIZE, sort)

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
    // `sort` is a dep so changing it refetches from page 1, which the block above
    // already does — a new ordering makes the old page number meaningless.
  }, [filters, hasAnyFilter, sort])

  function goToCatalogPage(page: number) {
    setCatalogLoading(true)
    fetchListingsPage(filters, page, CATALOG_PAGE_SIZE, sort)
      .then(({ listings, total }) => {
        setCatalogListings(listings)
        setCatalogTotal(total)
        setCatalogPage(page)
      })
      .catch(() => {})
      .finally(() => setCatalogLoading(false))
  }

  return (
    <div className={`${inter.className} relative flex flex-col h-screen bg-mist-50 overflow-hidden print:h-auto print:overflow-visible`}>
      <div className="flex flex-1 min-h-0">
        {/* One scroll container for the whole page. The detail panel used to be a
            flush sibling column pinned to the viewport edge, which is why the grid
            needed a mirrored 444px of left padding to look centred. It is now a
            rounded block inside the content row below, so panel and grid centre
            together as one unit and the padding trick is gone. */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden pb-6 px-6 print:overflow-visible">
          {/* Filter chips, centred under the floating header — the same bar the
              Map view uses, replacing the left sidebar panel this page had. It
              scrolls with the grid rather than floating, so nothing covers the
              cards. */}
          {/* Sort rides in the chip row's `trailing` slot — the same slot the Map
              uses for its color picker — so it sits inline with Beds/Price/Type
              rather than on a row of its own above the grid. */}
          <div className="-mx-6 mb-6 bg-[#E0CCB2] px-6 pb-6 pt-20 print:hidden">
            <div className="mx-auto flex max-w-[1400px] justify-center">
              <FilterChips
                filters={filters}
                onChange={setFilters}
                resultCount={catalogTotal || null}
                loading={catalogLoading}
                trailing={<SortButton value={sort} onChange={setSort} />}
              />
            </div>
          </div>

          {/* Grid + detail block share one centred row. `items-start` is what puts
              the block's top edge level with the first row of cards instead of
              running to the top of the page. Wider than the usual max-w-7xl because
              this row now carries the 480px panel that used to live outside it. */}
          <div className="mx-auto flex max-w-[1400px] items-start gap-6">
            {/* min-w-0 so the grid can shrink beside the fixed-width block rather
                than forcing the row wider than its container. */}
            <div className="min-w-0 flex-1">
              <BrowseCatalog
                listings={catalogListings}
                total={catalogTotal}
                page={catalogPage}
                pageSize={CATALOG_PAGE_SIZE}
                loading={catalogLoading}
                paginated={!hasAnyFilter}
                filters={filters}
                onPageChange={goToCatalogPage}
                onSelect={handleSelect}
              />
            </div>

            <div className="contents print:hidden">
              <PropertyPanel
                listing={selectedListing}
                onClose={() => setSelectedListing(null)}
                variant="block"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Floating header pill, overlaid on top like the Map view */}
      <div className="absolute top-0 inset-x-0 z-30 pointer-events-none [&_header>div]:pointer-events-auto print:hidden">
        <AppHeader />
      </div>
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
      {loading && listings.length === 0 ? (
        <div className="text-center text-sm text-neutral-400 py-16">Loading listings…</div>
      ) : (
        <ListingGrid
          entries={listings.map(listing => ({ listing }))}
          filters={filters}
          columns={2}
          onSelect={onSelect}
          className={`transition-opacity ${loading ? "opacity-50" : ""}`}
        />
      )}

      {/* Pagination — only shown when browsing the unfiltered catalog; a filtered
          result set is small enough to just load in full and scroll through. */}
      {paginated && (
        <div className="mt-6 flex justify-center pb-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-mist-100 bg-warm-ivory/95 p-1 shadow-[0_2px_12px_-5px_rgba(53,20,11,0.18)]">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1 || loading}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold text-ink-900/70 transition-colors enabled:cursor-pointer enabled:hover:bg-white enabled:hover:text-forest-green disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Previous
            </button>
            <span className="min-w-[96px] rounded-full bg-white px-3 py-2 text-center text-xs font-semibold text-ink-900/45 whitespace-nowrap">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages || loading}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold text-ink-900/70 transition-colors enabled:cursor-pointer enabled:hover:bg-white enabled:hover:text-forest-green disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
