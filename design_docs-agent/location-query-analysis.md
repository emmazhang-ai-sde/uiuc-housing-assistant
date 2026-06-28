# Location Query Analysis: "near green st/6th intersection"

**Created: 2026-06-25**

← Back to [Agent Architecture](agent-architecture.md)

---

## Origin

A real user request surfaced this analysis:

> "yo im on the waitlist. can you send me screenshots for 1beds/studios under 1200 near green st/6th intersection"

This was used as a test case to audit what the current RAG system can and cannot handle.

---

## Query Decomposition

| Part of query | Type |
|---|---|
| `1beds` | Bedroom filter: `beds = 1` |
| `studios` | Bedroom filter: `beds = 0` |
| `under 1200` | Price filter: `max_price_total = 1200` |
| `near green st/6th intersection` | Location filter: proximity to a specific street intersection |
| `screenshots` | Output format: listing images |

---

## Capability Audit

### ✅ Already works

**1BR filter (`beds = 1`)**
Handled by `extract_filters` → `build_where` → Chroma metadata filter `{"beds": {"$eq": 1}}`.

**Price under $1200 (`max_price_total`)**
Handled by `build_where` with `PRICE_FLEX_MARGIN` buffer applied to `price_total_low`.

**Proximity to "green st"**
`_LANDMARK_REGISTRY` in `rag_chain.py` maps `"green st"` / `"green street"` / `"campustown"` to a hardcoded coordinate. `filter_by_location` then runs haversine and drops listings farther than `PROXIMITY_RADIUS_MI = 0.5`.

**photo_url in data**
Every listing in ChromaDB metadata has a `photo_url` field. The data is there; the UI needs to surface it.

**Studio data exists**
`beds = 0` listings exist in ChromaDB (3 confirmed). The extract prompt correctly maps "studio" → `beds: 0`.

---

### ❌ Gaps found

**Gap 1: "Green St/6th intersection" coordinate is wrong**

The existing `"green st"` landmark is pinned at `(40.1096, -88.2100)` — the eastern end of Green Street near Lincoln Avenue. The actual Green St & 6th St intersection is approximately `(40.1096, -88.2410)`, about 0.3 miles further west. A user asking for listings "near green st/6th" would receive results centered on the wrong point.

**Gap 2: "1beds/studios" combined filter**

`extract_filters` outputs a single integer for `beds`. When a query mentions both "1 bed" and "studio", the LLM picks one and drops the other. The backend `build_where` already supports `{"beds": {"$in": [0, 1]}}` — the issue is the extract prompt template only documents `"beds": <integer or null>`, not an array.

**Gap 3: Screenshots / listing images**

The current UI does not render `photo_url`. The `ListingCard` component receives `photo_url` from the API but rendering it is already implemented (it renders a `<img>` tag when `photo_url` is truthy). The gap is in the export/share flow: there is a "Save cards PNG" button that exports the card grid, but there is no "send screenshots" feature analogous to what a human would do in a group chat.

---

## Fixes Applied

### Fix 1: Added Green St/6th intersection to `_LANDMARK_REGISTRY`

**File:** `rag/rag_chain.py`

```python
# Before (only covered the eastern end of Green St)
(["green street", "green st", "campustown"], (40.1096, -88.2100)),

# After (added specific intersection entry)
(["green street", "green st", "campustown"],       (40.1096, -88.2100)),
(["green and 6th", "green/6th", "green st/6th",
  "6th and green", "6th street and green"],         (40.1096, -88.2410)),
```

The new coordinate `(40.1096, -88.2410)` targets Green St & 6th St rather than the general Campustown area. The haversine filter (0.5 mi radius) then applies from this more precise anchor point.

**Note:** The coordinate is an estimate based on Champaign's street grid. Verify by dropping `40.1096, -88.2410` into Google Maps.

The same entry also needs to be added to the **frontend** landmark registry:

**File:** `frontend/lib/landmarks.ts`

```typescript
{
  name: "Green St & 6th St",
  lat: 40.1096, lng: -88.2410,
  aliases: ["green and 6th", "green/6th", "green st/6th", "6th and green"],
},
```

---

### Fix 2: Allow beds to be an array in extract prompt (pending)

**File:** `rag/rag_chain.py` — `EXTRACT_PROMPT`

Change the beds field documentation from:

```
"beds": <integer or null>
```

to:

```
"beds": <integer, list of integers, or null>
```

And add an example:

```
- "1 bed or studio" → {"beds": [0, 1], ...}
- "1beds/studios"   → {"beds": [0, 1], ...}
```

`build_where` already handles list input — no other changes needed.

**Status:** Not yet implemented.

---

## Related: "Sort by Distance" Feature

While auditing the location query, a related UI gap was identified: listings are returned in semantic relevance order, not by distance from the queried landmark. A "sort by distance" control in the card view was built.

### Why not haversine?

Straight-line (haversine) distance is not suitable — users walk on streets, not through buildings. Champaign-Urbana is a grid city so the error is manageable (~15–20%), but actual walking time is more useful and accurate.

### Solution: OpenRouteService (ORS) for both walk and drive

> **Important finding:** `router.project-osrm.org` is a **car-only** public server. Requesting
> the `foot` profile silently falls back to car routing, returning ~2 min when Google Maps
> shows 16 min walk. Pedestrian routing requires a separate service.
>
> Both walking and driving now use ORS so only one API key is needed.

**OpenRouteService (ORS) Matrix API**

- Walking: `POST https://api.openrouteservice.org/v2/matrix/foot-walking`
- Driving: `POST https://api.openrouteservice.org/v2/matrix/driving-car`
- Free tier: 2000 req/day total. Each sort action costs 2 requests (walk + drive) = 1000 searches/day.
- API key: `NEXT_PUBLIC_ORS_API_KEY` in `frontend/.env.local`
- Register at openrouteservice.org → API Keys

Both profiles share the same response shape:

```json
{ "durations": [[0, 245, 312, 180, ...]] }
```

`durations[0][0]` = 0 (source → itself). Offset = 1 for all destinations.

### Implementation

**`frontend/lib/osrm.ts`** (new file)

```typescript
// Both functions filter null-coord listings, map results back to original index
fetchWalkingSeconds(sourceLat, sourceLng, destinations) → Promise<(number | null)[]>
fetchDrivingSeconds(sourceLat, sourceLng, destinations) → Promise<(number | null)[]>
```

**`frontend/components/AssistantMessage.tsx`**

- `sortLandmark: Landmark | null` — which landmark to sort from
- `walkSeconds`, `driveSeconds` — parallel state arrays indexed to `listings`
- `walkCache`, `driveCache` — `useRef<Map<string, ...>>` keyed by landmark name; revisiting a landmark skips the API calls
- `useEffect` on `sortLandmark` — fires `Promise.all([fetchWalkingSeconds, fetchDrivingSeconds])` in parallel
- `sortedListings` via `useMemo` — converts seconds → minutes, sorts by `walkMins` ascending, null entries go to end
- **Auto-preselect (Option C):** `useState` initializer calls `resolveLandmark(filtersApplied?.location_hint)` — if the query contained a location hint (e.g. `"green st"`), the matching landmark is pre-selected on mount; user can override via dropdown or clear with ✕
- Sort dropdown is only shown in Cards view

**`frontend/components/ListingCard.tsx`**

Added `walkMins?: number | null` and `driveMins?: number | null` props. Renders two stacked badges under the availability badge in the top-right corner:
- `~N min walk` (from ORS)
- `~N min drive` (from OSRM)

**`frontend/app/page.tsx`**

- Added `filtersApplied: Record<string, unknown>` to the assistant `Message` type
- Stores `res.filters_applied` from the backend search response in the message
- Passes it down as `filtersApplied` prop to `AssistantMessage`

### Data flow

```
Backend /api/search
  └── filters_applied: { location_hint: "green st", ... }
        ↓
page.tsx stores in Message
        ↓
AssistantMessage receives filtersApplied
  └── resolveLandmark("green st") → Landmark { name: "Green Street (Campustown)", lat, lng }
  └── sortLandmark auto-set on mount
        ↓
useEffect → Promise.all([
  fetchWalkingSeconds(landmark, listings),   // ORS foot-walking
  fetchDrivingSeconds(landmark, listings),   // OSRM car
])
        ↓
sortedListings (useMemo)
  └── [{ listing, walkMins: 14, driveMins: 3 }, ...]   sorted by walkMins
        ↓
ListingCard → "~14 min walk" + "~3 min drive" badges
```

### Known geocoding data quality issue

Some listings show incorrect walking distances because their coordinates in ChromaDB were misgeocoded by Nominatim during the pipeline. Confirmed cases:

| Address | Stored coords | Symptom |
|---|---|---|
| 911 S Locust | (40.1069, -88.2407) | ORS: ~4 min walk; Google Maps: ~17 min |
| 605 S. Fifth | (41.88, -87.71) | Coordinates are in Chicago, not Champaign |
| Helen Ct townhomes | (42.01, -88.18) | Coordinates are in Dundee IL, not Champaign |

**Fix location:** `pipeline/geocode.py` — `MANUAL_COORDS` dict (lines 26–52).

**Repair steps:**
1. Open Google Maps → search each address → right-click → "What's here?" → copy lat/lng
2. Add entry to `MANUAL_COORDS`: `"911 S Locust": (40.XXXXX, -88.XXXXX),`
3. NULL out existing coords in the SQLite DB for those addresses
4. Re-run `python -m pipeline.geocode`
5. Re-run `python -m pipeline.ingest` to push updated coords to ChromaDB

A comment block with these instructions is already in `pipeline/geocode.py` above `MANUAL_COORDS`.

---

## Open Items

| Item | Status | File to change |
|---|---|---|
| Green St/6th coordinate in backend registry | ✅ Done | `rag/rag_chain.py` |
| Green St/6th coordinate in frontend landmarks | ✅ Done | `frontend/lib/landmarks.ts` |
| Extract prompt: allow beds as array | ⬜ Pending | `rag/rag_chain.py` — `EXTRACT_PROMPT` |
| Sort by distance (walk+drive) in card view | ✅ Done | `frontend/lib/osrm.ts`, `frontend/components/AssistantMessage.tsx`, `frontend/components/ListingCard.tsx` |
| Geocoding bug — 911 S Locust / 605 S. Fifth / Helen Ct | ⬜ Pending | `pipeline/geocode.py` — `MANUAL_COORDS` |
| Listing images in "send screenshots" flow | ⬜ Pending | `frontend/components/AssistantMessage.tsx` |
