"use client"

import { forwardRef } from "react"
import ListingCardV2 from "@/components/ListingCardV2"
import type { Listing, Filters } from "@/lib/api"

export type ListingGridEntry = {
  listing: Listing
  walkMins?: number | null
  driveMins?: number | null
}

type Props = {
  entries: ListingGridEntry[]
  filters?: Filters | null
  maxPricePerBed?: number | null
  // Card views live in different layouts (a full-width page vs. a column squeezed
  // next to a conversation + detail panel), so the column count intentionally
  // differs per usage rather than being forced to match.
  columns: 2 | 3 | 4
  onSelect?: (listing: Listing) => void
  className?: string
}

const COLS_CLASS: Record<2 | 3 | 4, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
}

// Renders the jobright-style ListingCardV2 everywhere — promoted from the
// /card-v2 preview to the one true card skin (2026-07-15). The old skin lives
// at design-docs/post-launch/archive/listing-card-v1.tsx if ever needed.
const ListingGrid = forwardRef<HTMLDivElement, Props>(function ListingGrid(
  { entries, filters = null, maxPricePerBed = null, columns, onSelect, className = "" },
  ref
) {
  return (
    <div ref={ref} className={`grid grid-cols-1 ${COLS_CLASS[columns]} gap-3 ${className}`}>
      {entries.map(({ listing, walkMins, driveMins }, i) => (
        <ListingCardV2
          key={`${listing.url}-${i}`}
          listing={listing}
          maxPricePerBed={maxPricePerBed}
          walkMins={walkMins}
          driveMins={driveMins}
          filters={filters}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
})

export default ListingGrid
