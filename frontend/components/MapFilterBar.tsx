"use client"

import { Filters } from "@/lib/api"
import FilterBar from "@/components/FilterBar"

type Props = {
  filters: Filters
  onChange: (f: Filters) => void
}

export default function MapFilterBar({ filters, onChange }: Props) {
  return (
    <div className="absolute top-4 left-4 z-10">
      <FilterBar filters={filters} onChange={onChange} />
    </div>
  )
}
