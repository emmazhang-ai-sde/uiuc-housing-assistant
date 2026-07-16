"use client"

import { Filters } from "@/lib/api"
import FilterBar from "@/components/FilterBar"

type Props = {
  filters: Filters
  onChange: (f: Filters) => void
  className?: string
}

export default function MapFilterBar({ filters, onChange, className = "absolute top-4 left-4 z-10" }: Props) {
  return (
    <div className={className}>
      <FilterBar filters={filters} onChange={onChange} />
    </div>
  )
}
