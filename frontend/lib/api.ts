const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export interface Listing {
  company: string
  address: string
  unit_type: string
  beds: number
  price_per_bed_low: number | null
  price_per_bed_high: number | null
  price_total_low: number | null
  price_total_high: number | null
  availability: string
  is_available: boolean          // Phase 6: pre-computed in ingest.py
  area: string
  url: string
  lat: number | null             // Phase 7: geocoded coordinates
  lng: number | null
}

// Phase 6: explicit UI filters sent alongside every NL query
export interface Filters {
  beds: number[] | null
  available_only: boolean | null
  max_price_per_bed: number | null
  company: string | null
  buffer_type: "percent" | "fixed" | "exact" | null  // how the price buffer is applied
  buffer_value: number | null                         // % or $ amount; null when type is "exact"
}

export const DEFAULT_FILTERS: Filters = {
  beds: null,
  available_only: null,
  max_price_per_bed: null,
  company: null,
  buffer_type: "percent",
  buffer_value: 15,
}

export interface SearchResponse {
  answer: string
  listings: Listing[]
  filters_applied: Record<string, unknown>  // Phase 6: echoed back from backend
}

export interface DataStatus {
  last_scraped: string | null
  listing_count: number | null
  property_count: number | null
}

export async function fetchStatus(): Promise<DataStatus> {
  const res = await fetch(`${API_URL}/api/status`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

// Phase 6: accepts explicit filters alongside the NL query
export async function search(query: string, filters: Filters): Promise<SearchResponse> {
  const res = await fetch(`${API_URL}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, filters }),
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}
