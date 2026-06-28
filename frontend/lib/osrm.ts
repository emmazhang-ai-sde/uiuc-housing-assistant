// Both walking and driving use OpenRouteService (ORS) Matrix API.
// Free tier: 2000 req/day total. Each sort action costs 2 requests (walk + drive).
// API key: NEXT_PUBLIC_ORS_API_KEY in frontend/.env.local
//
// Coordinate order: [lng, lat] throughout.

const ORS_BASE = "https://api.openrouteservice.org/v2/matrix"
const ORS_KEY  = process.env.NEXT_PUBLIC_ORS_API_KEY ?? ""

type Dest = { lat: number | null; lng: number | null }

function buildValid(destinations: Dest[]) {
  return destinations
    .map((d, i) => ({ i, lat: d.lat, lng: d.lng }))
    .filter((d): d is { i: number; lat: number; lng: number } =>
      d.lat != null && d.lng != null
    )
}

function mapRow(
  row: (number | null)[],
  valid: { i: number }[],
  total: number,
  offset: number   // 1 if response includes source-to-source at row[0], else 0
): (number | null)[] {
  const result: (number | null)[] = Array(total).fill(null)
  valid.forEach((d, idx) => {
    result[d.i] = row[idx + offset] ?? null
  })
  return result
}

async function fetchOrsSeconds(
  profile: "foot-walking" | "driving-car",
  sourceLat: number,
  sourceLng: number,
  destinations: Dest[]
): Promise<(number | null)[]> {
  const valid = buildValid(destinations)
  if (valid.length === 0) return destinations.map(() => null)

  const locations = [
    [sourceLng, sourceLat],
    ...valid.map(d => [d.lng, d.lat]),
  ]

  const res = await fetch(`${ORS_BASE}/${profile}`, {
    method: "POST",
    headers: { "Authorization": ORS_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ locations, sources: [0], metrics: ["duration"] }),
  })
  if (!res.ok) throw new Error(`ORS ${profile} HTTP ${res.status}`)

  const data = await res.json()
  // ORS includes source→source as durations[0][0] = 0, so offset = 1
  return mapRow(data.durations[0], valid, destinations.length, 1)
}

export function fetchWalkingSeconds(
  sourceLat: number, sourceLng: number, destinations: Dest[]
): Promise<(number | null)[]> {
  return fetchOrsSeconds("foot-walking", sourceLat, sourceLng, destinations)
}

export function fetchDrivingSeconds(
  sourceLat: number, sourceLng: number, destinations: Dest[]
): Promise<(number | null)[]> {
  return fetchOrsSeconds("driving-car", sourceLat, sourceLng, destinations)
}
