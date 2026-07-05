# Phase 5.2.1 — Green Street Scraper

**Created: 2026-07-04**

> Scraper-specific commands and modes for Green Street. Part of [Phase 5.2 — Data Refresh Runbook](phase-5.2-data-refresh-runbook.md); see that doc for the full pipeline (normalize/geocode/ingest) and shared raw-file/archive behavior. Index: [Phase 5 — Scraper and Normalize Strategy](phase-5-scraper-and-normalize-strategy.md).

## Why detail pages can be skipped

Price, availability, beds/baths/sqft, and unit types all come from the main **list page**, which is re-fetched in full on every run — so they're never stale. The **detail pages** (one visit per property) only carry static enrichment: description, amenities, lease dates, utility fees, and the brochure URL. Because none of the volatile data lives there, a detail page that was already fetched successfully can be safely reused on a later run instead of re-fetched.

## Commands

**Incremental fill (default):**

```bash
python scrapers/green_street.py
```

Reuses the detail-page fields of any property whose detail page was already successfully fetched in a previous run (tracked via a `detail_ok` flag stored on each listing), and only fetches detail pages for properties still missing that flag. Price/availability/beds/baths/sqft are always re-fetched fresh from the list page regardless, so nothing about pricing goes stale. Safe to run repeatedly: each run narrows the remaining gap, so a scrape that timed out on 20 properties the first time only needs to fetch those 20 (much faster) on the next run, then even fewer next time, until none are left. A property with a genuinely empty description is marked `detail_ok` after one successful visit and is not re-fetched forever chasing content that was never there. The very first run after this feature was added treats the existing raw file as having no `detail_ok` flags yet, so it re-fetches everything once; after that, incremental fill applies normally.

**Force a full re-fetch:**

```bash
python scrapers/green_street.py --fresh
```

Ignores `data/green_street_raw.json` entirely and re-fetches every detail page from scratch, even ones already marked complete. Use this when you want to pick up changes to the static fields themselves (e.g. a property updated its description or amenities), not just fill gaps.

## Partial failures and how to re-run

A scraper logging a few `⚠ Failed to load ...: Timeout` lines is **not a crash**. The scraper retries the navigation once, and if that still fails, skips the property and keeps going. The only consequence is that the skipped property loses its detail-page fields; its core data (address, floor plan, price, availability) still comes through from the main listing page regardless.

Decide by how many failed:

- **A handful of timeouts** — usually fine to keep and continue with normalize/geocode/ingest.
- **Many timeouts** — just re-run the scraper; the default incremental-fill mode above only re-fetches what's still missing, so this is cheap.

```bash
python scrapers/green_street.py
python -m pipeline.normalize
python -m pipeline.geocode
python -m pipeline.ingest
```

The scraper waits on `domcontentloaded` plus the target element (not full network idle) and retries navigation once, so timeouts are rarer to begin with than under the older `networkidle` wait strategy. Each run adds a new timestamped file to `data/raw_archive/`; a run that still has missing properties is archived as `..._partial.json` and auto-removed once a later, complete run supersedes it (see `scrapers/_archive.py`). If a re-scrape produces identical data, normalize writes no new snapshot and ingest reports "already up to date" — that is expected, not an error.

## Rough timing

10s crawl-delay per request, per `robots.txt`. A full first-time scrape of ~254 properties takes tens of minutes. A subsequent incremental-fill run only pays that delay for the properties still missing enrichment, so a run that only needs to patch 20 properties takes a few minutes instead.
