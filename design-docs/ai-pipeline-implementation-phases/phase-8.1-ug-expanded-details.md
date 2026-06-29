# Phase 8.1 — Universities Group: Expanded Property Details

## Goal

Enrich every UG listing record with property-level data (exterior photo, area classification, availability summary, marketing tagline) by scraping `/building-list/` before the existing detail-page loop.

---

## Source pages & field availability

| Field | `/building-list/` ✅ | `/property-details/<slug>/` ✅ | `/apartment-search/` ❌ |
|---|---|---|---|
| **URL** | ugroupcu.com/building-list/ | ugroupcu.com/property_details-sitemap.xml | ugroupcu.com/apartment-search/ |
| **Scope** | Property-level | Unit-level | Property-level |
| **robots.txt** | ✅ Permitted | ✅ Permitted| ✅ Permitted |
| `photo_url` | ✅ | ❌ | ❌ |
| `availability_summary` | ✅ | ❌ | ❌ |
| `tagline` | ✅ | ❌ | ❌ |
| `area` | ✅ | ❌ | ❌ |
| `unit_type` | ❌ | ✅ | ❌ |
| `price_total` | ❌ | ✅ | ❌ |
| `price_per_bed` | ❌ | ✅ | ❌ |
| `availability` | ❌ | ✅ | ✅ ¹ |
| `baths` | ❌ | ✅ | ❌ |
| `beds` | ❌ | ✅ | ❌ |
| `description` | ❌ | ❌ | ✅ ² |

> All three pages are on the same domain (`ugroupcu.com`) and share a single [robots.txt](https://ugroupcu.com/robots.txt) (`Disallow:` empty — all paths open).  
> ¹ CSS button class only (`room_available` / `room_leased`) — not a structured value.  
> ² Truncated marketing copy — not the full description from detail pages.

---

## Fields captured 

### From `/building-list/` (property-level, one card per building)

| Field | HTML selector | Example value |
|---|---|---|
| `photo_url` | `div.featured_bx_inner > a > img[src]` | `https://ugroupcu.com/property_images/property/thumb/9f8f…exterior.jpg` |
| `availability_summary` | `div.line1_desc` | `"Brand New for August 2026!"` |
| `tagline` | `div.line2_desc` | `"LUXURY 1 BR! HUGE!"` |
| `area` | `p.proerpty_option` (strip `"Area: "` prefix) | `"South Campus (Champaign), West Campus"` |

> `area` fills the field that was previously hardcoded `""` for all UG records.

### Photo dimensions & format

URL path is `/property_images/property/thumb/` — these are thumbnail versions, not originals.

| Property | Finding |
|---|---|
| Path | `/property/thumb/` — server-side thumbnails, not originals |
| Dimensions | **Not uniform** — photos come from different shoots; no standardised crop or resize |
| Orientation | Mix of landscape and portrait |
| Format | Mixed: `.jpg`, `.jpeg`, `.png`, `.JPG` — no single format |
| CDN | Served behind Incapsula; blocks server-to-server requests (returns 212-byte HTML error). Images load normally in a browser once the Incapsula session cookie is set |

**Frontend implication:** use `object-cover` with a fixed-height container. The container enforces the layout; `object-cover` centre-crops whatever aspect ratio the photo happens to be. Measuring actual pixel dimensions is not possible programmatically without a live browser session.

### From detail pages (unit-level, one tab per floor plan — existing, unchanged)

| Field | Source |
|---|---|
| `unit_type` | `h4.propert_head` |
| `price_total` | `"Price per month"` label/value pair |
| `price_per_bed` | `"Price per occupant"` label/value pair |
| `availability` | `"Availability"` label/value pair |
| `baths` | `"Bathrooms"` label/value pair |
| `beds` | Parsed from unit type name via regex |

### URL normalization

Building-list hrefs lack trailing slash (`/property-details/412-e-healey-champaign`) while sitemap URLs include one (`/property-details/412-e-healey-champaign/`). `norm_url(url)` strips the trailing slash on both sides before building/querying the lookup dict.

---

## Scraper run history

### Run 1 — 2026-06-17 (sitemap-based, before fixes)

```
Found 275 properties (from sitemap)
  → 159 properties indexed from building list

✅ Saved 221 floor plan listings from 90 properties
   📷 221/221 records have a photo_url
```

**Failures:**
- Category A — Empty pages: junk sitemap URLs (test pages, expired offer pages, leased-out properties) — loaded but had 0 unit tabs
- Category B — Timeout from property [133] onward: Incapsula rate-limited after ~130 rapid requests (`CRAWL_DELAY = 2s` too short)
- Category C — Cascade failure: after first timeout, every subsequent `page.goto()` was "interrupted by another navigation" — no context restart logic

### Run 2 — 2026-06-17 (building-list-based, after fixes)

**Fixes applied:**
- Replaced sitemap as URL source with building-list keys directly — eliminates all junk URLs, reduces scope from 275 → 159
- Added consecutive-failure counter: restart browser context after 3 timeouts in a row
- Increased `CRAWL_DELAY` 2s → 5s

```
Scraping 159 active properties from building list
...
✅ Saved 389 floor plan listings from 159 properties
   → data/universities_group_raw.json
```

**Result:** 389 listings — identical to the very first historical run, confirming building-list covers all active properties with zero data loss.

### Run `python scrapers/universities_group.py` comparison

| Metric | Original (sitemap) | Run 1 (building-list, 2026-06-17) | Run 2 (building-list, 2026-06-17) |
|---|---|---|---|
| URL source | sitemap (275) | sitemap (275) | building-list (159) |
| Properties scraped | 275 | 90 (rest timed out) | 159 |
| Floor plan listings | 389 | 221 | 389 |
| photo_url | ❌ | 221/221 (100%) | 389/389 (100%) |
| area populated | ❌ | partial | 389/389 (100%) |

**Run 2 (Pipeline run — 2026-06-17)**

```
normalize  →  879 listings written (389 UG + 490 GSR)
geocode    →  410/410 addresses geocoded successfully
ingest     →  Added: 0 | Re-embedded: 377 | Metadata-only: 490 | Removed: 0
```

- **Re-embedded 377**: UG records whose `text` changed (area now populated, was `""` before)
- **Metadata-only 490**: GSR records — text unchanged, but Chroma metadata updated with new empty-string fields (`photo_url`, `availability_summary`, `tagline`)

---

## Code changes

### `scrapers/universities_group.py`

- Added `BUILDING_LIST_URL = "https://ugroupcu.com/building-list/"`
- Added `norm_url(url)` — strips trailing slash for consistent dict keys
- Added `scrape_building_index(page)` — fetches `/building-list/`, returns `{url: {photo_url, availability_summary, tagline, area}}`
- `parse_property(html, url, photo_info)` — now accepts `photo_info` dict; uses `area` from it instead of hardcoded `""`; attaches `photo_url`, `availability_summary`, `tagline` to every floor-plan record
- Main loop: uses `building_index.keys()` directly as the URL list (replaces sitemap); context restart after 3 consecutive failures; `CRAWL_DELAY` increased to 5s

### `pipeline/normalize.py`

- `normalize()` reads `photo_url`, `availability_summary`, `tagline` from raw record (defaults `""` — GSR records unaffected)
- SQLite `CREATE TABLE` — added: `photo_url TEXT`, `availability_summary TEXT`, `tagline TEXT`, `lat REAL`, `lng REAL`
- `executemany()` INSERT updated to include the three new columns
- Added `read_geocoded_coords()` / `restore_geocoded_coords()` — reads `lat`/`lng` from the previous snapshot before `write_db()` drops the table, then restores them after; ensures `geocode.py` only processes truly new addresses

### `pipeline/ingest.py`

- `load_listings()` SELECT — added `photo_url`, `availability_summary`, `tagline`
- Chroma metadata dict — added the three new fields (empty string when absent; Chroma rejects `None`)

### `frontend/lib/api.ts`

- `Listing` interface — added `photo_url: string`, `availability_summary: string`, `tagline: string`

---

## Checklist

- [x] Confirm scraping permission (`robots.txt` — `Disallow:` empty)
- [x] Identify `/building-list/` as the source for property-level photo + area data
- [x] Implement `scrape_building_index()` + merge into `parse_property()`
- [x] Add `photo_url`, `availability_summary`, `tagline` to SQLite schema (`normalize.py`)
- [x] Add new fields to Chroma metadata (`ingest.py`)
- [x] Add new fields to `Listing` interface (`frontend/lib/api.ts`)
- [x] Fix 1 — use building-list URLs directly instead of sitemap (eliminates junk)
- [x] Fix 2 — restart browser context after 3 consecutive failures
- [x] Fix 3 — increase `CRAWL_DELAY` to 5s
- [x] Re-run scraper — 389 listings / 159 properties confirmed
- [x] Run pipeline: `normalize` → `geocode` → `ingest`

