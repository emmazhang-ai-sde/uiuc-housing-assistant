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
  photo_url: string              // Phase 8: exterior photo from /building-list/
  availability_summary: string   // Phase 8: property-level note e.g. "Available August 2026"
  tagline: string                // Phase 8: marketing tagline e.g. "LUXURY 1 BR! HUGE!"
  description: string            // Phase 8.2: full property description from detail page
  amenities: string              // Phase 8.2: comma-separated amenity tags
  lease_dates: string            // Phase 8.2: e.g. "Aug 21, 2026 – Jul 31, 2027"
  utility_fees: string           // Phase 8.2: e.g. "$55/bed includes water, internet, trash"
  brochure_url: string           // Phase 8.2: PDF brochure link, empty when absent
  property_type: string          // Phase 8.3: e.g. "Apartment", "House", "Townhouse"
}

// Phase 6: explicit UI filters sent alongside every NL query
export interface Filters {
  beds: number[] | null
  availability_window: "now" | "june_2026" | "july_2026" | "august_2026" | "leased" | null
  max_price_per_bed: number | null
  company: string | null
  buffer_type: "percent" | "fixed" | "exact" | null  // how the price buffer is applied
  buffer_value: number | null                         // % or $ amount; null when type is "exact"
  property_type: string | null                        // "Apartment" | "House" | "Townhouse"
  penthouse: boolean | null                           // sub-filter under Apartment
}

export const DEFAULT_FILTERS: Filters = {
  beds: null,
  availability_window: null,
  max_price_per_bed: null,
  company: null,
  buffer_type: "percent",
  buffer_value: 15,
  property_type: null,
  penthouse: null,
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
// token: Supabase JWT access token — passed as Authorization header to FastAPI
export async function fetchAllListings(filters: Filters): Promise<Listing[]> {
  const params = new URLSearchParams()
  if (filters.beds?.length)              filters.beds.forEach(b => params.append("beds", String(b)))
  if (filters.max_price_per_bed != null) params.set("max_price_per_bed", String(filters.max_price_per_bed))
  if (filters.buffer_type)               params.set("buffer_type", filters.buffer_type)
  if (filters.buffer_value != null)      params.set("buffer_value", String(filters.buffer_value))
  if (filters.availability_window)       params.set("availability_window", filters.availability_window)
  if (filters.company)                   params.set("company", filters.company)
  if (filters.property_type)             params.set("property_type", filters.property_type)
  if (filters.penthouse != null)         params.set("penthouse", String(filters.penthouse))

  const res = await fetch(`/api/listings?${params}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const data = await res.json()
  return data.listings as Listing[]
}

export async function search(query: string, filters: Filters, token?: string): Promise<SearchResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers["Authorization"] = `Bearer ${token}`
  const res = await fetch(`${API_URL}/api/search`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, filters }),
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}
