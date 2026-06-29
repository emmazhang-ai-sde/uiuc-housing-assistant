# Filter System

**Created: 2026-06-27**

← Back to [Agent Architecture](agent-architecture.md)

---

## Overview

Filters are structured parameters sent alongside every natural language query. They bypass the LLM extraction step and apply directly as hard Chroma metadata constraints. This gives users precise, deterministic control over results that NL alone cannot guarantee.

---

## Data Flow

```
User selects filter in FilterPanel
        ↓
Filters state (page.tsx)
        ↓
POST /api/search  { query, filters }
        ↓
rag_chain.py: merge_filters()   ← NL-extracted values merged in; explicit UI values win
        ↓
rag_chain.py: build_where()     ← converts to Chroma $where DSL
        ↓
Chroma metadata pre-filter
        ↓
Semantic re-rank on filtered subset
        ↓
Response: listings + filters_applied echoed back
        ↓
SearchSummary badge shows active filters
```

---

## Filters Interface (`frontend/lib/api.ts`)

```ts
interface Filters {
  beds: number[] | null
  availability_window: "now" | "june_2026" | "july_2026" | "august_2026" | "leased" | null
  max_price_per_bed: number | null
  company: string | null          // exact match on company metadata field
  buffer_type: "percent" | "fixed" | "exact" | null
  buffer_value: number | null     // % or $ amount; null when type is "exact"
  property_type: string | null    // "Apartment" | "House" | "Single Family Home"
}
```

---

## UI Sync Rule

**FilterPanel and ReadOnlyFilterSnapshot must always look identical.**

`FilterPanel` (`frontend/components/FilterPanel.tsx`) is the interactive filter bar the user fills in before submitting. `ReadOnlyFilterSnapshot` (`frontend/components/UserBubble.tsx`) is the read-only version that appears inside the conversation bubble after the query is sent. These two components must stay visually in sync at all times:

- Same layout (row order, column structure)
- Same label style (font weight, color, spacing)
- Same pill appearance (size, radius, active/inactive colors)
- Same row grouping (which filters are full-width vs. in columns)

**When you change the layout or style of FilterPanel, update ReadOnlyFilterSnapshot to match — and vice versa.**

---

## FilterPanel UI (`frontend/components/FilterPanel.tsx`)

Layout: 2-column grid (Type+Beds | Max $/bed+Buffer), then two full-width rows (Availability, Source).

| Row | Position | Control | Maps to |
|---|---|---|---|
| Type | Col 1, row 1 | Pill: All / Apartment / House | `property_type` |
| Beds | Col 1, row 2 | Pill: Any / Studio / 1 / 2 / 3 / 4+ (multi-select) | `beds` |
| Max $/bed | Col 2, row 1 | Number input with $ prefix | `max_price_per_bed` |
| Buffer | Col 2, row 2 | Pill: exact / +% / +$ + value input | `buffer_type` + `buffer_value` |
| Availability | Full-width row | Pill: All / Now / Jun '26 / Jul '26 / Aug '26 / Leased | `availability_window` |
| Source | Full-width row | Pill: All + company logo buttons | `company` |

Label style: `text-black font-bold text-xs`. Label-to-pill gap: `gap-5`. Active pill: `bg-black text-white`. Inactive pill: `bg-neutral-100 text-neutral-900`.

`ReadOnlyFilterSnapshot` (`frontend/components/UserBubble.tsx`) mirrors this layout exactly using `<span>` instead of `<button>`.

---

## Backend: `FilterParams` (`backend/main.py`)

Pydantic model that deserializes the `filters` field from the POST body. **Every filter field that exists in the frontend `Filters` interface must also be declared here** — Pydantic silently drops unknown fields, causing filters to be ignored.

```python
class FilterParams(BaseModel):
    beds: int | list[int] | None = None
    max_price_per_bed: int | None = None
    availability_window: str | None = None
    company: str | None = None
    buffer_type: str | None = None
    buffer_value: float | None = None
    property_type: str | None = None
```

> **Gotcha (2026-06-27):** `property_type` was missing from `FilterParams`, causing the House filter to be silently dropped. Any new filter field must be added to both `frontend/lib/api.ts` **and** `backend/main.py`.

---

## Backend: `build_where()` (`rag/rag_chain.py`)

Converts the merged filter dict to Chroma's `$where` DSL:

| Filter field | Chroma clause |
|---|---|
| `beds` | `{"beds": {"$in": [...]}}` or `{"beds": {"$gte": 4}}` for 4+ |
| `availability_window` | maps to pre-computed bool fields — see Availability Window section |
| `max_price_per_bed` | `{"price_per_bed_low": {"$lte": ceiling}}` where ceiling includes buffer |
| `company` | `{"company": {"$eq": "..."}}` |
| `property_type` | `{"property_type": {"$eq": "..."}}` |

Multiple clauses are combined with `{"$and": [...]}`.

---

## Property Type Data

As of 2026-06-27 the database contains 871 listings across 3 `property_type` values:

| property_type | Green Street Realty | Universities Group | Total |
|---|---|---|---|
| Apartment | 396 | 377 | 773 |
| House | 97 | — | 97 |
| Single Family Home | 1 | — | 1 |

Universities Group only has Apartments. Houses and Single Family Homes are all Green Street Realty.

---

## SearchSummary Badge (`frontend/components/AssistantMessage.tsx`)

After a query is submitted, a dark pill shows the active filters:

| Row | Content |
|---|---|
| Bedroom | e.g. "Studio, 1" |
| Budget | e.g. "≤ $1,200/bed (exact)" |
| Query | The raw NL query string |
| Filter | Available listings only · House (when set) |

The Filter row is omitted if no availability or company/type filter is active.

---

## Availability Window Filter

### Analysis (2026-06-27)

The `availability` field is **free-text, comma-concatenated**, scraped verbatim from each source. The two active companies format it differently:

| Company | Style | Example |
|---|---|---|
| Green Street Realty | Clean month strings | `Available June 2026`, `Available Now`, `Leased` |
| Universities Group | Marketing copy appended | `Immediate Move-In : Move-In Today!, Available August 2026, ***JUNE MOVE-IN SPECIAL!` |

**Distribution across 871 docs:**

| Tab | Docs | Notes |
|---|---|---|
| `now` | 38 | Includes `now`-only (15) and `now + aug` (12) and `now + june` (11) |
| `june_2026` | 15 | `Available June 2026` + `***JUNE MOVE-IN SPECIAL!` (standalone or with `now`) |
| `july_2026` | 1 | `Available July 2026` — Green Street only |
| `august_2026` | 258 | Largest active bucket |
| `leased` | 580 | Majority of database |
| No tab (data gap) | 2 | Green Street listings with empty `availability` field — scraper miss |

**Overlap (23 docs appear in 2 tabs — intentional, not a bug):**

| Overlap | Docs | Raw `availability` |
|---|---|---|
| `now` + `june_2026` | 11 | `Immediate Move-In : Move-In Today!, ***JUNE MOVE-IN SPECIAL!` |
| `now` + `august_2026` | 12 | `Immediate Move-In : Move-In Today!, Available August 2026` |

Tabs are **independent filters, not mutually exclusive categories**. A listing available now that also offers an August lease correctly appears under both "Now" and "Aug '26". Users select one tab at a time and see all matching listings.

**Key structural findings:**
- June/July data exists **only at Green Street Realty**; Universities Group has no June/July listings
- `***JUNE MOVE-IN SPECIAL!` appearing alone (without an explicit month string) is classified as **June** by semantic intent — it is a June move-in promotion
- The 2 docs with empty `availability` are a scraper data gap; they appear only in "All" and are invisible to all window tabs

### Classification Rules (by month)

Since Chroma metadata filtering does not support substring/regex matching on string fields, availability windows must be **pre-computed as boolean metadata fields during ingest** (same pattern as `is_available`).

| Window field | Trigger text in `availability` | Tab label |
|---|---|---|
| `is_available_now` | contains `Available Now` OR `Immediate Move-In` OR `Move-In Today` | **Now** |
| `is_available_june` | contains `June 2026` OR (`JUNE MOVE-IN SPECIAL` AND NOT `August 2026`) | **Jun '26** |
| `is_available_july` | contains `July 2026` | **Jul '26** |
| `is_available_august` | contains `August 2026` | **Fall '26** |
| `is_leased` | contains `Leased` OR `Fully Leased` | **Leased** |

> `is_available_june` and `is_available_july` can be surfaced as a combined **Summer '26** tab (`$or` both fields) or as separate month tabs depending on UI space.

### Planned `Filters` field

```ts
availability_window: "now" | "june_2026" | "july_2026" | "august_2026" | "leased" | null
```

Maps to Chroma clauses:

| `availability_window` | Chroma `$where` clause |
|---|---|
| `"now"` | `{"is_available_now": {"$eq": true}}` |
| `"june_2026"` | `{"is_available_june": {"$eq": true}}` |
| `"july_2026"` | `{"is_available_july": {"$eq": true}}` |
| `"august_2026"` | `{"is_available_august": {"$eq": true}}` |
| `"leased"` | `{"is_leased": {"$eq": true}}` |

### FilterPanel UI (planned)

Replace the single Availability toggle with a 6-pill row:

| Pill | Value |
|---|---|
| All | `null` |
| Now | `"now"` |
| Jun '26 | `"june_2026"` |
| Jul '26 | `"july_2026"` |
| Aug '26 | `"august_2026"` |
| Leased | `"leased"` |

### Files to touch

1. `pipeline/ingest.py` — compute and store the 5 boolean fields per listing
2. `frontend/lib/api.ts` — add `availability_window` to `Filters` + `DEFAULT_FILTERS`; remove `available_only`
3. `frontend/components/FilterPanel.tsx` — replace toggle with 5-pill row
4. `rag/rag_chain.py` → `build_where()` — map `availability_window` to Chroma clause
5. `frontend/components/AssistantMessage.tsx` → `SearchSummary` — show window label in Filter row

---

## Availability Sort (`frontend/components/AssistantMessage.tsx`)

Clicking the **Availability ↓** sort button orders results using `availabilityStatus` and `availabilitySortValue` from `frontend/lib/availability.ts`.

| ↓ Descending (default) | ↑ Ascending |
|---|---|
| `now` first | LEASED / unavailable first |
| `available` sorted by earliest date | `available` sorted by latest date |
| LEASED / unavailable last | `now` last |

**Status priority:** `now` (2) > `available` (1) > `unavailable` (0).

Within the `available` group, date order is always earliest-first regardless of ↑/↓ direction — earlier availability is always strictly better from the user's perspective.

> **History:** Prior to 2026-06-27, the sort was a binary `is_available` boolean check and never called `availabilitySortValue`. The upgrade wires up the existing date-parsing logic that was previously unused.

---

## LEASED Card Visual Treatment (`frontend/components/ListingCard.tsx`)

When `availabilityStatus(listing.availability) === "unavailable"`, the photo area of the listing card receives a `bg-white/60` overlay (60% opaque white), creating a washed-out "white veil" effect. This signals at a glance that the unit is gone without hiding the card entirely.

- The `LEASED` badge and walk/drive time chips remain above the overlay (`z-10`) and stay fully legible.
- Adjust `/60` up or down to tune opacity (lighter = more detail visible, heavier = stronger "skip me" signal).
- Applies to any `unavailable` availability string, not just the literal word "Leased".

---

## Files to Touch When Adding a New Filter

1. `frontend/lib/api.ts` — add field to `Filters` + `DEFAULT_FILTERS`
2. `backend/main.py` → `FilterParams` — **must add here too** or Pydantic will silently drop it
3. `frontend/components/FilterPanel.tsx` — add UI row
4. `frontend/components/UserBubble.tsx` → `ReadOnlyFilterSnapshot` — mirror the same row (UI sync rule)
5. `rag/rag_chain.py` → `build_where()` — add Chroma clause
6. `frontend/components/AssistantMessage.tsx` → `SearchSummary` — show in Filter row
