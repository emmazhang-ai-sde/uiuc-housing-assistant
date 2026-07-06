# Phase 9.5 — JSJ Property Management Scraper

**Created: 2026-07-05**

> Scraper-specific notes and commands for JSJ Property Management. Part of [Phase 9 — Expanded Company Coverage](phase-9-expanded-company-coverage.md); see [Phase 5.2 — Data Refresh Runbook](phase-5.2-data-refresh-runbook.md) for the full pipeline and shared raw-file/archive behavior.

## Legality check (done first, per the Phase 9 standing rule)

- `robots.txt`: Duda default — `User-agent: *` with no disallows. Crawling permitted.
- No Terms of Service exists anywhere (all standard URLs 404); the site has no privacy page either.
- All data public, no login, no bot protection (plain `curl` gets a 200).

## Why this is a Smile clone

jsjmanagement.com is a Duda-built site with the same AppFolio listings widget as Smile ([Phase 9.1](phase-9.1-smile-scraper.md)) — the same public collections endpoint, just a different SiteAlias (`42273af2`, visible as `window.Parameters.SiteAlias`) and AppFolio database (`jsjproperty.appfolio.com`):

```
GET https://www.jsjmanagement.com/rts/collections/public/42273af2/runtime/collection/appfolio-listings/query-data?pageSize=100&pageNumber=N&query=()&language=ENGLISH
```

~124 listings over two pages; the scraper pages until a short page is returned. Every field comes from this one feed, including exact lat/lng, so JSJ (like Smile and Bankier) skips Nominatim entirely.

## Data mapping differences from Smile

**Rents are whole-unit, not per-bed.** JSJ is a traditional manager: `by_the_bed` is false on every record, no listing carries "individual lease"/"per person" boilerplate, and rents rise with bedroom count (2bd $775–950, 3bd $1,095+, 4bd $1,595+) instead of falling per-bed. So `price_total` = rent and `price_per_bed` = rent ÷ beds — the inverse of Smile's rule. `roommate_match` stays false.

**Geographic filter.** JSJ manages properties well beyond Champaign-Urbana (Charleston/EIU, Rantoul, Mahomet, White Heath). This product is UIUC housing, so the scraper keeps only `address_city` in {Champaign, Urbana, Savoy} and reports how many out-of-area records it skipped. Records with rent ≤ 0 (pseudo-listings) are also skipped, same as Smile.

**No named neighborhoods** on the site → `area` stays empty. Listing `url` points at the AppFolio detail page (`jsjproperty.appfolio.com/listings/detail/<uid>`).

## Failure model

All-or-nothing, same as Smile: one or two HTTP requests; a failure exits nonzero and writes nothing.

## Commands

```bash
python scrapers/jsj.py
python -m pipeline.normalize
python -m pipeline.geocode   # skips JSJ rows — coords come from the feed
python -m pipeline.ingest
```

## Rough timing

Seconds.
