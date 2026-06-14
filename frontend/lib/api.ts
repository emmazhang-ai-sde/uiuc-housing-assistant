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
  area: string
  url: string
}

export interface SearchResponse {
  answer: string
  listings: Listing[]
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

export async function search(query: string): Promise<SearchResponse> {
  const res = await fetch(`${API_URL}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}
