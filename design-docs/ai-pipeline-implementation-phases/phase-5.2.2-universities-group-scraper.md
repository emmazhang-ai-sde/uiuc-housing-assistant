# Phase 5.2.2 — Universities Group Scraper

**Created: 2026-07-04**

> Scraper-specific commands and modes for Universities Group. Part of [Phase 5.2 — Data Refresh Runbook](phase-5.2-data-refresh-runbook.md); see that doc for the full pipeline (normalize/geocode/ingest) and shared raw-file/archive behavior. Index: [Phase 5 — Scraper and Normalize Strategy](phase-5-scraper-and-normalize-strategy.md).

## Why detail pages must be re-fetched every run

Unlike Green Street, the list page here (`/building-list/`) only provides photo, area, and an availability summary. Price, availability, unit types, and beds all live on the **detail page**, one visit per property. Because the volatile data is on the detail page, it cannot be skipped for freshness by default — every run re-fetches all of them.

## A property that fails is a gap, never fabricated

If a property's detail page fails to fetch, it is simply left out of this run's output — no old data is substituted for it. This means a run's `failed` count is always an honest reflection of what's actually missing, and the canonical file (`data/universities_group_raw.json`) can temporarily hold fewer properties than the site actually has until a later run fills the gap back in. This replaced an earlier design that backfilled failures with stale data from a previous run; that made a run's output look complete even when it wasn't, and caused the same logical scrape session to produce multiple separate "complete" archive files instead of converging to one.

**Caution:** don't run `pipeline.normalize` / `pipeline.ingest` while a session still has gaps. A property missing from `universities_group_raw.json` looks identical to one that was actually delisted, and ingest will remove it from the live search index — it reappears once a later pass successfully fetches it, but in the meantime it won't show up in search results. Finish the retry loop below until it reports zero missing, then run the rest of the pipeline.

## Commands

**Full refresh (default):**

```bash
python scrapers/universities_group.py
```

Fetches every property's detail page fresh. Any property that fails this run is left out of the output — not backfilled — so `data/universities_group_raw.json` may temporarily have fewer properties than the full site until a later run fills the gap.

**Retry only what's missing:**

```bash
python scrapers/universities_group.py --retry-missing
```

Skips any property already present in the canonical file from a previous run (presence there always means "successfully fetched," never stale — see above), and only (re)fetches properties still missing. Run it repeatedly: each pass narrows the gap until nothing is missing.

## Partial failures and how to re-run

A scraper logging a few `⚠ Failed to load ...` lines is **not a crash** — the affected properties are just missing from this run's output, and the run continues. Three consecutive failures trigger a browser context restart (to re-warm the Incapsula session) rather than continuing to fail.

To converge a session (initial run plus however many retries it takes) down to a single complete file:

```bash
python scrapers/universities_group.py --retry-missing
```

Repeat until the run reports no missing properties. Each pass adds a new timestamped file to `data/raw_archive/`; any pass that still has gaps is archived as `..._partial.json`, and once a pass finally reports zero missing, that complete archive is kept and every same-day `_partial` archive from this session is deleted automatically (see `scrapers/_archive.py`) — so the session converges to exactly one archived file, not one per pass. Once complete, continue the pipeline:

```bash
python -m pipeline.normalize
python -m pipeline.geocode
python -m pipeline.ingest
```

If a re-scrape produces identical data, normalize writes no new snapshot and ingest reports "already up to date" — that is expected, not an error.

## Rough timing

5s delay between detail-page requests (2s previously triggered Incapsula). A full run of ~250 properties takes several minutes to tens of minutes, plus any time spent restarting the browser context after repeated timeouts. A `--retry-missing` run only pays that delay for properties still missing, so it's much faster once most properties are already covered.
