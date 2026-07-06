# Phase 9.4 — Bankier Apartments Scraper

**Created: 2026-07-05**

> Scraper-specific notes and commands for Bankier Apartments. Part of [Phase 9 — Expanded Company Coverage](phase-9-expanded-company-coverage.md); see [Phase 5.2 — Data Refresh Runbook](phase-5.2-data-refresh-runbook.md) for the full pipeline and shared raw-file/archive behavior.

## Legality check (done first, per the Phase 9 standing rule)

- **Main site** (`bankierapartments.com`, WordPress on Flywheel): robots.txt is Flywheel's default (only calendar-widget paths disallowed; no crawl-delay), no Terms of Service exists (privacy policy only), all data public. Clear.
- **Per-building microsites** (each of the 13 properties redirects to its own domain, e.g. `406bankierapartments.com`): all sit behind a real Cloudflare managed challenge (`cf-mitigated: challenge`). That is active bot-detection, and this project does not bypass bot-detection — same standard as Phase 9.3. **The scraper never touches the microsites**; the `url` field simply links users there, and a human clicking through in a normal browser passes the challenge as intended.

## Where the data comes from

The main site's homepage search posts to a public endpoint, which returns server-rendered property cards:

```
POST https://bankierapartments.com/wp-admin/admin-ajax.php
     action=propertysearch & beds-<N>=on & pricesmall=0 & pricebig=8000
```

Each card carries `data-latitude`/`data-longitude` (so **Bankier skips Nominatim entirely**, like Smile), `data-url` (the microsite link), `data-image-url`, amenity slugs as CSS classes (`amenities-air-conditioning ...`), an availability class (`propertytypes-immediate`), and `.rentrange`/`.bedsrange`/`.bathsrange`/`.sqftrange` spans. Querying once per bed count (0–4, six requests total with the unfiltered pass) makes the ranges bed-specific, giving property × bed-count granularity: e.g. 509 E. Green 1BR "$900–1120".

## Granularity and mapping caveats (accepted trade-offs)

This is the coarsest scraper in the fleet, by design — the finer data (floorplan names, exact availability dates, descriptions) lives only behind the Cloudflare challenge:

- One record per **property × bed count** (`unit_type` = "Studio"/"N Bedroom"), not per named floorplan.
- **Prices are whole-unit** (1BR $860; 4BR $3100 ≈ $775/bed — joint leases, no per-person boilerplate anywhere), so `price_total` = the listed range and `price_per_bed` = total ÷ beds. `roommate_match` stays false.
- A priced row is `Available` ("Available, Immediate Move-In options in building" when the property carries the `propertytypes-immediate` class — note that flag is building-level, not per bed count). A row showing "Pricing unavailable" is treated as `Leased`: Bankier removes pricing for configurations they can't currently lease. If that assumption ever looks wrong, re-check a card against its microsite manually in a browser.
- `sqftrange` is frequently 0 (unmaintained on their side) — dropped when zero.

## Failure model

Six POSTs, all-or-nothing: any failed request aborts the run without writing (same model as Smile/Seven07). No retry modes; re-run the scraper.

## Commands

```bash
python scrapers/bankier.py
python -m pipeline.normalize
python -m pipeline.geocode   # skips Bankier rows — coords come from the search cards
python -m pipeline.ingest
```

## Rough timing

Seconds — six POSTs with a 2s politeness delay.
