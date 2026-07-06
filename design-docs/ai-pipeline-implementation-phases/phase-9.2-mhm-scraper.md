# Phase 9.2 — MHM Properties Scraper

**Created: 2026-07-05**

> Scraper-specific notes and commands for MHM Properties. Part of [Phase 9 — Expanded Company Coverage](phase-9-expanded-company-coverage.md); see [Phase 5.2 — Data Refresh Runbook](phase-5.2-data-refresh-runbook.md) for the full pipeline (normalize/geocode/ingest) and shared raw-file/archive behavior.

## Legality check (done before any scraper work — this is the standing process now)

- `robots.txt`: `User-agent: *` with an empty `Disallow:` (everything permitted) and `Crawl-delay: 10`, which the scraper honors between page requests.
- No Terms of Service / Terms of Use page exists anywhere in the site's sitemaps, so there is no contractual anti-scraping clause.
- All listing data is public HTML, no login. The only third-party service (Rent Manager at `mhmprop.twa.rentmanager.com`) hosts their application form, which the scraper never touches.

## Site shape

mhmproperties.com is a plain WordPress site (server-rendered, no bot protection), and the whole portfolio is **18 property pages** on a custom `property` post type, enumerated authoritatively by `https://www.mhmproperties.com/property-sitemap.xml` (the "Apartments" and "Houses & Condos" nav pages link the same 18 pages, so the sitemap is safe to trust here, unlike UG's junk-filled sitemap). Everything lives on the property page in clean, id-tagged sections:

- `<h1>` — street address (no city; all MHM properties are in Champaign, so the scraper appends it)
- `#overview` — `h2` tagline + description paragraphs
- `#price .pricebox` — one row per unit type: label text + `<span>` holding either a price (`$625/person (LAST UNIT)`) or `LEASED!`, plus an optional "View Typical Unit" floorplan link
- `#amenities li` — amenity list
- `#photos a.pimg img` — gallery photos

Requests + BeautifulSoup only; no Playwright.

## Two pricebox flavors

**Apartment buildings** label rows by unit type ("3 Bed/1 Bath - Jacuzzi", "2 Bed/2 Bath"), from which beds/baths are parsed; the full label is kept as `unit_type`. **Houses** label rows by lease year ("2026-2027:"), with no per-row beds/baths; those become `unit_type: House` (which `normalize.py` also maps to `property_type: House`), the year goes into `lease_dates`, and beds/baths stay empty rather than being guessed from prose like "group home for 8-9 people".

**Prices are per person assuming full occupancy** (stated on every page), so `price_per_bed` = the listed price and `price_total` = price × beds when beds are known; when beds are unknown (houses), `price_total` stays empty rather than fabricated. A `LEASED!` row gets `availability: Leased` and no price; a priced row gets `availability: Available`, with any parenthetical note like "(LAST UNIT)" appended. As of 2026-07-05 every 2026–2027 row is LEASED, so the initial ingest adds coverage without prices; prices appear when MHM's next leasing season opens.

No named neighborhoods exist on the site, so `area` stays empty. No sqft either. No coordinates anywhere (the map-view page loads its map via JS), so MHM addresses go through the normal `pipeline/geocode.py` Nominatim path with `MANUAL_COORDS` as the backstop — 18 standard street addresses, low risk.

## Failure model

Like Green Street's list-page model, all volatile data is on pages fetched fresh every run. Each page is independent: a page that fails to fetch is simply left out of the run (honest gap, never backfilled — see Phase 5.2.2), the run reports `failed`, and `scrapers/_archive.py` archives it as `_partial`. With only 18 pages at 10s apart, the fix is just re-running the scraper; no incremental or `--retry-missing` machinery is warranted at this size.

## Commands

```bash
python scrapers/mhm.py
python -m pipeline.normalize
python -m pipeline.geocode   # MHM has no feed coords — Nominatim geocodes new addresses
python -m pipeline.ingest
```

## Rough timing

18 pages × 10s crawl-delay (per robots.txt) ≈ 3 minutes for a full run.
