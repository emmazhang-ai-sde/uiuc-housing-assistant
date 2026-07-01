# Map View Tab

**Created: 2026-06-29**

## Overview

Add a standalone Map tab to the existing chat page. The map tab is a full-screen, interactive map experience with a floating filter bar — inspired by Apartments.com's map view, but adapted to this project's design language.

---

## Page Structure

The chat page gains a **top header bar** containing two tabs:

| Tab | Content |
|-----|---------|
| **Chat** | Existing chat interface (unchanged) |
| **Map** | New standalone map view (this doc) |

Tab switcher is located in the **top header bar** (like a page-level navigation).

---

## Map Tab Layout

- **Full-height, full-width map** — uses the existing MapLibre / react-map-gl plugin (same as `MapView.tsx`)
- **No right-side listing panel** — purely map + pin popups
- Click a pin → existing popup behavior (photo, address, price, availability, link)
- Map fills the entire viewport below the header

---

## Data Source

Listings are fetched **directly from the backend** — all listings, without going through a chat query.

- Endpoint: new `GET /api/listings` (to be added to `backend/main.py`)
- Applies the active UI filters client-side or passes them as query params
- No LLM involvement — pure metadata filter + fetch

---

## Floating Filter Bar

### Position
- `position: absolute` overlaid **on top of the map**, near the top
- Map remains full height (filter bar does not shrink the map)
- Visually floats as a card/row above the map tiles

### Interaction Model
- A **horizontal row of pill buttons**
- Each pill represents one filter dimension
- Clicking a pill **opens a dropdown panel** directly below that pill
- Selecting a value closes the panel; pill updates to show active state (e.g., "Beds: 2, 3")
- Style: same Morandi / muted palette as existing `FilterPanel.tsx` pills

### Filter Pills (consolidated from existing FilterPanel)

| Pill | Covers | Panel Contents |
|------|--------|----------------|
| **Beds** | `beds` | Pill buttons: Any / Studio / 1 / 2 / 3 / 4+ (multi-select) |
| **Price** | `max_price_per_bed` + `buffer_type` + `buffer_value` | Price input + buffer type selector + buffer value input |
| **Type** | `property_type` + `penthouse` | Pill buttons: All / Apartment / House·Townhouse; Penthouse subtype appears when Apartment selected |
| **Availability** | `availability_window` | Pill buttons: All / Now / Jun '26 / Jul '26 / Aug '26 / Leased |
| **Source** | `company` | Logo pill buttons for each company (same as existing Source row) |

A **"Clear all"** button sits at the end of the pill row.

---

## Active State on Pills

When a filter has a non-default value, the pill shows a summary label and a distinct active style:

- Beds: `Beds: 2, 3`
- Price: `≤ $900 +15%`
- Type: `Apartment`
- Availability: `Aug '26`
- Source: `[logo]`

---

## Components to Build / Modify

| File | Change |
|------|--------|
| `backend/main.py` | Add `GET /api/listings` endpoint — returns all listing metadata with optional filter params |
| `frontend/app/chat/page.tsx` | Add top header bar with Chat / Map tab switcher |
| `frontend/app/map/page.tsx` | New page: fetches listings, renders MapView + MapFilterBar |
| `frontend/components/MapFilterBar.tsx` | New component: floating pill row + per-pill dropdown panels |
| `frontend/components/MapView.tsx` | No changes needed (reused as-is) |
| `frontend/lib/api.ts` | Add `fetchAllListings()` function |

---

## Implementation Steps

### Step 1 — Backend: `GET /api/listings`

Add a new endpoint to `backend/main.py` that returns all listing metadata from the latest snapshot database, with optional filter params passed as query parameters (beds, max_price_per_bed, buffer_type, buffer_value, availability_window, company, property_type). No LLM, no vector search — pure SQL + metadata filter.

**Test results (2026-06-29):**

| Test | Result |
|------|--------|
| No filters | 883 listings (full dataset) |
| `beds=2` | 283 listings |
| `max_price_per_bed=800&buffer_type=exact` | 341 listings |
| `availability_window=now` | 39 listings |
| `beds=2&beds=3&max_price_per_bed=900&buffer_type=percent&buffer_value=15` | 360 listings |
| Response shape | Matches frontend `Listing` interface exactly |

### Step 2 — Frontend API: `fetchAllListings()`

Add a `fetchAllListings(filters: Filters): Promise<Listing[]>` function to `frontend/lib/api.ts` that calls `GET /api/listings` with the current filter state serialized as query params.

### Step 3 — MapFilterBar component

Create `frontend/components/MapFilterBar.tsx`:
- Horizontal row of 5 pill buttons (Beds, Price, Type, Availability, Source) + a Clear all button
- Positioned `absolute` top of the map container (e.g., `top-4 left-1/2 -translate-x-1/2`)
- Each pill manages its own open/close state; clicking outside closes the active panel
- Each pill renders a dropdown panel below it with the relevant filter controls (reuse pill button patterns from `FilterPanel.tsx`)
- Pill label updates to reflect active filter value

### Step 4 — Map page

Create `frontend/app/map/page.tsx`:
- Fetches all listings via `fetchAllListings()` on mount, re-fetches when filters change
- Renders `MapView` at full viewport height
- Renders `MapFilterBar` overlaid on the map (parent div is `relative`, filter bar is `absolute`)
- Holds `filters` state and passes it to both `MapFilterBar` (for display + onChange) and `MapView` (for pin color logic)

**Changes (2026-06-29):**

| File | Change |
|------|--------|
| `app/api/listings/route.ts` | New — Next.js proxy, auth check + forward to Python backend |
| `lib/api.ts` | `fetchAllListings()` updated to call `/api/listings` (proxy, no token needed client-side) |
| `components/MapView.tsx` | Added `mapHeight?` prop, default behavior unchanged |
| `app/map/page.tsx` | New — filter state → fetch → full-screen MapView + floating MapFilterBar + loading/empty/error states |

### Step 5 — Tab switcher in header

Modify `frontend/app/chat/page.tsx` (and/or layout):
- Add a top header bar with two tabs: **Chat** and **Map**
- "Chat" stays on `/chat`, "Map" links to `/map`
- Active tab is highlighted; style follows existing Morandi palette
- Header bar sits above the existing chat layout (`flex flex-col h-screen`)

**Changes (2026-06-29):**

| File | Change |
|------|--------|
| `components/AppHeader.tsx` | New — `usePathname` highlights active tab |
| `components/MapView.tsx` | Added `className` prop to allow overriding outer div styles |
| `app/chat/page.tsx` | Outer div changed to `flex-col`, added `<AppHeader />`, main area wrapped in `flex-1 min-h-0` |
| `app/map/page.tsx` | Same structure, map container uses `flex-1 overflow-hidden`, `mapHeight="100%"` |

### Step 6 — Polish & edge cases

- Loading state while listings are being fetched (skeleton or spinner on the map)
- Empty state if no listings match the active filters (toast or inline message)
- Closing an open pill panel when another pill is clicked (only one panel open at a time)
- "Clear all" resets filters to `DEFAULT_FILTERS` and collapses any open panel

---

## Out of Scope

- Right-side listing list panel (pure map only)
- Saving / exporting from the map tab (already exists in the chat map view)
- Mobile / responsive layout (deferred)
