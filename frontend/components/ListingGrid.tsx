"use client"

import { forwardRef } from "react"
import ListingCard from "@/components/ListingCard"
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
  columns: 3 | 4
  onSelect?: (listing: Listing) => void
  className?: string
}

const COLS_CLASS: Record<3 | 4, string> = {
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
}

const ListingGrid = forwardRef<HTMLDivElement, Props>(function ListingGrid(
  { entries, filters = null, maxPricePerBed = null, columns, onSelect, className = "" },
  ref
) {
  return (
    <div ref={ref} className={`grid grid-cols-1 ${COLS_CLASS[columns]} gap-3 ${className}`}>
      {entries.map(({ listing, walkMins, driveMins }, i) => (
        <ListingCard
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
