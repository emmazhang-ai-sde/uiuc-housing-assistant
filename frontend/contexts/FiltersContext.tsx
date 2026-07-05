"use client"

import { createContext, useContext, useState, ReactNode } from "react"
import { Filters, DEFAULT_FILTERS } from "@/lib/api"

type FiltersContextValue = {
  filters: Filters
  setFilters: (filters: Filters) => void
}

const FiltersContext = createContext<FiltersContextValue | null>(null)

// Lives in the root layout (mounted once, outside per-route pages) so Map and
// Card keep sharing the same filter selection as the user switches between them.
export function FiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  return (
    <FiltersContext.Provider value={{ filters, setFilters }}>
      {children}
    </FiltersContext.Provider>
  )
}

export function useFilters() {
  const ctx = useContext(FiltersContext)
  if (!ctx) throw new Error("useFilters must be used within FiltersProvider")
  return ctx
}
