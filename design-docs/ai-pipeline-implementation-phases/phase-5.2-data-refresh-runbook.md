# Phase 5.2 — Data Refresh Runbook

**Created: 2026-07-04**

> The current end-to-end operational runbook for the multi-company pipeline. For the original design rationale (snapshots, raw archive, incremental Chroma), see [Phase 5.1 — Snapshot Versioning](phase-5.1-snapshot-versioning.md). Per-scraper commands and modes live in [Phase 5.2.1 — Green Street Scraper](phase-5.2.1-green-street-scraper.md) and [Phase 5.2.2 — Universities Group Scraper](phase-5.2.2-universities-group-scraper.md). Index: [Phase 5 — Scraper and Normalize Strategy](phase-5-scraper-and-normalize-strategy.md).

How to pull fresh listing data end to end: scrape both companies, normalize into a dated snapshot, geocode new addresses, and incrementally update the Chroma index.

## Prerequisites

- Virtualenv activated:
  ```bash
  source .venv/bin/activate
  ```
- Run every command from the **project root**.

## Full pipeline (in order)

```bash
# 1. Scrape (run each company once). See Phase 5.2.1 / 5.2.2 for scraper modes and flags.
#    Writes data/<company>_raw.json (overwritten each run, the "latest" file)
#    plus data/raw_archive/<company>_raw_YYYY-MM-DD_HHMMSS.json (never overwritten).
python scrapers/green_street.py
python scrapers/universities_group.py

# 2. Normalize: read every data/*_raw.json, clean, write snapshots/listings_<today>.db.
#    If the data is unchanged vs the previous snapshot, nothing is written.
python -m pipeline.normalize

# 3. Geocode: fill lat/lng for new addresses in the latest snapshot.
#    Already-geocoded addresses are skipped. See Phase 5.3 if a pin ends up
#    outside Champaign-Urbana — that's a known Nominatim failure mode, not a bug here.
python -m pipeline.geocode

# 4. Ingest: incrementally update chroma_db/ (only re-embeds changed listings).
python -m pipeline.ingest
```

**Re-running after a partial scrape failure (timeouts):** a scraper logging a few `⚠ Failed to load ...` lines is not a crash — the affected properties are simply left out of that run's output (never fabricated from old data), and the run keeps going. Re-run only the scraper(s) that had gaps, then repeat steps 2–4 as-is. The company that scraped cleanly does not need re-running. **For Universities Group, don't run steps 2–4 until a run reports zero missing properties** — a property temporarily missing from its raw file looks identical to a delisted one and would get removed from the live search index by ingest.

```bash
# Green Street — plain re-run only fetches what's still missing (incremental fill, cheap):
python scrapers/green_street.py

# Universities Group — retry just the properties still missing, without re-fetching
# everything already covered:
python scrapers/universities_group.py --retry-missing

# Then repeat the rest of the pipeline:
python -m pipeline.normalize
python -m pipeline.geocode
python -m pipeline.ingest
```

Both commands are safe to run repeatedly — each pass narrows the remaining gap until nothing is missing, converging to a single complete archived file per scrape session. See [Phase 5.2.1](phase-5.2.1-green-street-scraper.md#partial-failures-and-how-to-re-run) / [Phase 5.2.2](phase-5.2.2-universities-group-scraper.md#partial-failures-and-how-to-re-run) for the full explanation of each mode, plus Green Street's `--fresh` if you want to force a full re-fetch instead of incremental fill.

## Order matters

- **Normalize runs after both scrapers.** It merges all `data/*_raw.json` in one pass, so both companies' latest raw files must exist first.
- **Geocode and ingest run after normalize.** Both read the snapshot that `snapshots/latest.txt` points to, which normalize is responsible for producing/updating.

## Notes

- **Refreshing only one company still requires running normalize on both.** Normalize merges every `data/*_raw.json`. If you only re-scrape one company, the other's `_raw.json` keeps its previous contents and is merged in unchanged. There is no per-company normalize.
- **Unchanged data is skipped automatically.** Normalize diffs against the previous snapshot; if identical, it writes no new `.db` and leaves `latest.txt` untouched, and ingest then reports "already up to date."
- **Two raw files per scrape, opposite behavior.** `data/<company>_raw.json` is overwritten every run (always the newest, and the only thing normalize reads). `data/raw_archive/` keeps one timestamped file per run and is never overwritten, so same-day re-runs accumulate rather than clobber. A run with missing properties is archived as `..._partial.json` and auto-removed once a later, complete run supersedes it (see `scrapers/_archive.py`). The archive is a local safety net and is gitignored.

## Where each scraper's changing data lives (why the two scrapers behave differently)

Both scrapers fetch two kinds of pages every run: one cheap **list page** (always fetched in full) and many expensive **detail pages** (one per property). What differs is *which page holds the volatile data* (price, availability), and that decides whether detail pages can be skipped on a re-run.

| | List page provides | Detail page provides |
|---|---|---|
| **Green Street** | Price, availability, beds/baths/sqft, unit types — the volatile fields | Description, amenities, lease dates — static only |
| **University Group** | Photo, area, availability summary only | Address, price, unit types, beds — the volatile fields |

- **Green Street** — the volatile fields already arrive on the list page (re-fetched fresh every run), so the detail pages carry only static enrichment. Detail pages that were already fetched can be safely reused/skipped on a re-run. Details, commands, and flags: [Phase 5.2.1](phase-5.2.1-green-street-scraper.md).
- **University Group** — price lives on the detail pages, so they must be re-fetched every run to stay fresh; a property that fails to fetch is simply left out of the output (a gap), never filled in with old data. Details, commands, and flags: [Phase 5.2.2](phase-5.2.2-universities-group-scraper.md).

Both scrapers share the same underlying principle for handling a failed fetch — leave it as an honest gap, never fabricate it from old data — but the *scope* of that gap differs because of the table above:

| | Scope of "empty" on a failed fetch |
|---|---|
| **Green Street** | Only the detail-page fields go blank (description/amenities/lease_dates/utility_fees/brochure_url). Core data — address, price, unit type, availability — is always present, since it's re-fetched from the list page every run regardless of detail-page success. |
| **Universities Group** | The entire property record is missing. Address, price, and everything else live only on the detail page, so a failed detail fetch means there is no data at all for that property this run. |

This is why a Green Street gap never breaks anything downstream (the property still shows up, just less enriched), while a Universities Group gap is the one that needs the normalize/ingest caution above — an entirely absent property looks like a delisted one until a later `--retry-missing` pass fills it back in.

## Rough timing

| Step | Time | Notes |
|------|------|-------|
| `green_street.py` | several minutes | 10s crawl-delay per request (robots.txt); see [Phase 5.2.1](phase-5.2.1-green-street-scraper.md) for how re-runs get faster |
| `universities_group.py` | several minutes | 5s delay; restarts browser context on repeated timeouts; see [Phase 5.2.2](phase-5.2.2-universities-group-scraper.md) |
| `pipeline.normalize` | seconds | pure local processing |
| `pipeline.geocode` | up to ~8 min on a full run | ~410 addresses × 1.1s; skips already-geocoded, so incremental runs are fast; see [Phase 5.3](phase-5.3-geocoding-manual-lookup.md) for known Nominatim failure modes |
| `pipeline.ingest` | seconds to minutes | only re-embeds changed listings |
