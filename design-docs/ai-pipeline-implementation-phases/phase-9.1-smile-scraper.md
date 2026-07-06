# Phase 9.1 — Smile Student Living Scraper

**Created: 2026-07-05**

> Scraper-specific notes and commands for Smile Student Living. Part of [Phase 9 — Expanded Company Coverage](phase-9-expanded-company-coverage.md); see [Phase 5.2 — Data Refresh Runbook](phase-5.2-data-refresh-runbook.md) for the full pipeline (normalize/geocode/ingest) and shared raw-file/archive behavior.

## Why this scraper needs no browser

smilestudentliving.com is a Duda-built site whose `/availability` page renders an AppFolio listings widget (their AppFolio database is `fairlawn.appfolio.com`). The widget loads its data from a public Duda Collections JSON endpoint that requires no cookies, no JS execution, and has no bot protection (verified: plain `curl` gets a 200), so unlike Green Street (Playwright for list + detail pages) and Universities Group (Playwright with Incapsula warm-up), this scraper is a single `requests` call:

```
GET https://www.smilestudentliving.com/rts/collections/public/0af4bf1b/runtime/collection/appfolio-listings/query-data?pageSize=100&pageNumber=0&query=()&language=ENGLISH
```

`0af4bf1b` is the Duda SiteAlias, visible in the page source as `window.Parameters.SiteAlias`. The scraper pages through until a page returns fewer than `pageSize` records (currently ~38 total, so one page). Every listing field we need is in this one response: address, beds/baths/sqft, rent, availability date, amenities, utilities, marketing description, photos, and exact lat/lng straight from AppFolio.

## Data mapping decisions

**Multi-bed rents are per bedroom.** AppFolio's `market_rent` is ambiguous on its face (`by_the_bed` is `False` on every record, even ones that are clearly by-the-bed). But nearly every 2+ bedroom listing's description carries boilerplate like "Prices displayed are for individual leases" / "Rent is listed per bedroom" / "priced per person", and the ones missing the boilerplate (e.g. 905 W Oregon, 3bd at $389) are per-bed by any sanity check and match their sibling building (907 W Oregon) which does carry it. So the rule is: for 2+ bedrooms, `price_per_bed` = rent and `price_total` = rent × beds; for studios and 1-bedrooms, both equal the rent. Listings with per-person pricing also get `roommate_match = true`, since Smile fills individual bedrooms (some listings even advertise "1 FEMALE Bedroom left").

**One junk record is filtered.** The feed contains a "SUBLEASE APPLICATION!" pseudo-listing with rent 0; anything with rent ≤ 0 is skipped and reported.

**Area comes from the marketing text.** Smile names its own neighborhoods (Midtown, Engineering, Gradland, Quad View, Art District, Seniorland) and mentions them in each listing's title/description ("...apartment in Midtown neighborhood..."); the scraper matches against that fixed list to fill `area`.

**Coordinates skip Nominatim entirely.** AppFolio provides `address_latitude`/`address_longitude` per listing. The scraper writes them into the raw records as `lat`/`lng`, and `pipeline/normalize.py` passes them through into the snapshot DB, so `pipeline/geocode.py` (which only processes rows where `lat IS NULL`) never touches Smile addresses. This avoids the whole class of Nominatim failure modes documented in [Phase 5.3](phase-5.3-geocoding-manual-lookup.md).

**Listing URL points at the AppFolio detail page.** The Duda site has no per-unit page, so `url` is `https://fairlawn.appfolio.com/listings/detail/<listable_uid>` (verified working), which shows photos, pricing, and the application link.

## Commands

```bash
python scrapers/smile.py
python -m pipeline.normalize
python -m pipeline.geocode   # skips Smile rows — coords come from the feed
python -m pipeline.ingest
```

## Failure model

The scrape is one HTTP request (per 100 listings), so there is no partial-failure machinery: either the run succeeds and is archived complete via `scrapers/_archive.py`, or the request fails, the script exits nonzero, and nothing is written. There is no `--retry-missing` / `--fresh` mode because there is nothing incremental to manage — every run is a full refresh. The honest-gap principle from Phase 5.2.2 holds trivially: the output can never mix fresh and stale data.

## Rough timing

Seconds. No crawl delay is needed for a single JSON request; if Smile's inventory ever grows past 100 listings, the pager adds one request per additional 100.
