# Phase 9.6 — Roland Realty Scraper

**Created: 2026-07-05**

> Scraper-specific notes and commands for Roland Realty. Part of [Phase 9 — Expanded Company Coverage](phase-9-expanded-company-coverage.md); see [Phase 5.2 — Data Refresh Runbook](phase-5.2-data-refresh-runbook.md) for the full pipeline and shared raw-file/archive behavior.

## Legality check (done first, per the Phase 9 standing rule)

- `robots.txt`: contains only a Sitemap line — no disallows, no crawl-delay. Crawling permitted.
- No Terms of Service exists (all standard URLs 404); `/privacy` is a standard template privacy policy with no anti-scraping, commercial-use, or bulk-request clauses.
- All data public, no login. A Cloudflare Turnstile widget exists on the page but gates a contact form, not the page itself — the listings HTML serves freely to plain requests, and the scraper never touches the form.

## Site shape

roland-realty.com is a Webflow site. The "All Fall '26 Listings" page (`/for-rent/available-fall/all-unit-listings`) server-renders unit cards — ~345 units across Roland's ~80 properties — with **server-side pagination** via `?f5630116_page=N` (~35 cards per page; the Finsweet filter UI on top is client-side only and irrelevant to scraping). Each card carries machine-readable `fs-cmsfilter-field` attributes:

- `.fs-address` / `.fs-name` — street address, sometimes with a unit suffix ("807 S Locust St-8")
- plain text "N Bedrooms M Bathrooms" (or Studio)
- `.fs_rent-fall` — whole-unit monthly rent; 0 renders as "Call for rate"
- `.fs_rent-fall-btb` — per-bed monthly rent (shown for by-the-bed units)
- `.fs-available` — true/false for Fall availability
- `.fs-style` — House / Apartment etc.; `.fs-area` — occasionally a neighborhood
- a "By-the-bed!" badge whose Webflow `w-condition-invisible` class marks it hidden (badge visible ⇒ unit leases by the bed ⇒ `roommate_match`)
- the card links to `/unit-listings/<slug>`, unique per unit

## Data mapping decisions

**Prices**: `price_total` = `fs_rent-fall` when > 0; `price_per_bed` = `fs_rent-fall-btb` when > 0, else total ÷ beds. When total is 0 but the per-bed rent exists (common for by-the-bed houses), total = per-bed × beds. Both 0 ("Call for rate") → no price.

**Availability**: `fs-available` true → "Available August 2026" (Roland's Fall '26 = August move-in; the phrasing keeps `ingest.py`'s `is_available_august` window flag working), false → "Leased". The separate available-now list (`/for-rent/available-now/...`) is not scraped in v1; cross-marking immediate move-ins from it is a possible enhancement.

**Unit suffixes**: an address like "807 S Locust St-8" is split — the `-8` goes into `unit_type` ("4 Bedroom (Unit 8)") and the address keeps the base street ("807 S Locust St, Champaign"). This keeps geocoding to one address per building and keeps ingest's doc ID (md5 of address|unit_type) unique between sibling units.

**City**: cards carry no city; all addresses get ", Champaign" (Roland's portfolio is Champaign campus). Any outlier that geocodes wrong goes through the Phase 5.3 `MANUAL_COORDS` process. Amenities render client-side via Finsweet nesting (placeholder text in raw HTML) and are skipped.

## Failure model

Pages are fetched until a page adds no new units. Any page that fails aborts the run without writing (all-or-nothing) — with ~10 pages this is simpler and safer than partial-run machinery.

## Commands

```bash
python scrapers/roland.py
python -m pipeline.normalize
python -m pipeline.geocode   # ~80 new addresses through Nominatim on first run
python -m pipeline.ingest
```

## Rough timing

~10 pages with a 2s politeness delay ≈ half a minute. First geocode run adds ~80 Nominatim lookups (~2 minutes).
