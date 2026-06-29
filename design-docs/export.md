# Export

**Created: 2026-06-28**

---

## Overview

Users can export the current listing results as PNG images directly from the chat UI. There are two export targets:

- **Cards PNG** — the listing card grid, paginated at 9 cards per image, exported from `AssistantMessage`
- **Table PNG** — the summary table view, exported from `SummaryTable`

Both use `html-to-image` via `frontend/lib/exportDom.ts`.

---

## Filename Convention

### Function: `buildExportSlug(filters: Filters)`

Defined in `frontend/lib/exportDom.ts`. Produces a kebab-case slug from the active filters. Fields are joined in this order; any field that is null/empty is omitted.

| Order | Field | Source | Example output |
|---|---|---|---|
| 1 | Type | `filters.property_type` | `apartment`, `house`, `single-family-home` |
| 2 | Beds | `filters.beds` | `studio`, `1br`, `2br`, `studio-1br` |
| 3 | Availability | `filters.availability_window` | `now`, `jun2026`, `jul2026`, `aug2026`, `leased` |
| 4 | Source | `filters.company` | `gsr`, `ug`, or slugified company name |
| 5 | Budget | `filters.max_price_per_bed` | `max600`, `max1300` |

Special cases:
- Bed count `0` → `studio` (not `0br`)
- `"Green Street Realty"` → `gsr`
- `"University Group"` → `ug`
- All other companies → lowercased, non-alphanumeric chars replaced with `-`
- No filters active → `all`

### Sort suffix

Appended after the filter slug in cards exports. Derived from `sortBy`, `sortDir`, and `sortLandmark` state in `AssistantMessage`.

| Sort state | Suffix |
|---|---|
| Default (none) | *(omitted)* |
| Beds ascending | `-beds-asc` |
| Beds descending | `-beds-desc` |
| Price ascending | `-price-asc` |
| Price descending | `-price-desc` |
| Availability ascending | `-avail-asc` |
| Availability descending | `-avail-desc` |
| Walk distance to landmark | `-walk-{landmark-slug}` |

### Chunk suffix

When results exceed 9 cards, each image gets a chunk suffix: `-{n}of{total}` (e.g., `-2of3`). Omitted when there is only one image.

### Full filename format

```
uiuc-housing-cards-{filter-slug}{sort-suffix}{chunk-suffix}.png
uiuc-housing-table-{filter-slug}.png
```

Examples:
```
uiuc-housing-cards-apartment-2br-aug2026-gsr-max800.png
uiuc-housing-cards-studio-1br-now-price-asc-2of3.png
uiuc-housing-cards-all-walk-ece-building.png
uiuc-housing-table-2br-aug2026-max1000.png
```

---

## PNG Image Layout (Cards)

Each exported cards PNG is a 1120px-wide flex-column div with two sections:

### Header bar

A single row with three equally-weighted flex columns, separated from the cards by a `1px #e5e5e5` border:

```
Showing 10–18 of 27 units    uiuc-housing-cards-2br-aug2026-price-asc-2of3.png    2 / 3
```

| Column | Content | Alignment |
|---|---|---|
| Left | `Showing {start}–{end} of {total} units` | Left |
| Center | Full filename (including `.png`) | Center |
| Right | `{page} / {total pages}` | Right |

Style: `font-size: 11px`, `color: #737373`, `font-family: sans-serif`, `padding: 14px 20px 10px`.

### Cards grid

3-column CSS grid, `gap: 12px`, `padding: 12px 16px 16px`. Each card is a deep clone of the live DOM card. A 9px muted URL label is appended to the bottom of each clone so the listing URL is readable in the PNG.

---

## DOM Construction

`saveCardImages()` in `frontend/components/AssistantMessage.tsx`:

1. Reads `cardsRef.current.children` and slices into chunks of 9.
2. For each chunk, creates:
   - **`shell`** — `position: fixed; top: 0; left: 0; z-index: -1; pointer-events: none` — keeps the element in the viewport so `html-to-image` can measure it, invisible to the user.
   - **`exportGrid`** — `display: flex; flex-direction: column; width: 1120px; background: #f5f5f5` — the captured element.
   - **`header`** — three-column flex row (see above).
   - **`cardsContainer`** — CSS grid of cloned cards.
3. Appends `exportGrid → shell → document.body`, captures via `downloadElementPng(exportGrid, filename)`, then removes `shell`.

---

## Files

| File | Role |
|---|---|
| `frontend/lib/exportDom.ts` | `buildExportSlug`, `downloadElementPng`, `downloadBlob`, `elementToPngBlob` |
| `frontend/components/AssistantMessage.tsx` | `saveCardImages()` — cards export logic |
| `frontend/components/SummaryTable.tsx` | `saveTableImage()` — table export, receives `filters: Filters` prop |
| `frontend/app/api/proxy-image/route.ts` | Server-side image proxy for CORS-blocked property photo domains |
