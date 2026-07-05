# Phase 5.1 — Snapshot Versioning & Incremental Chroma Updates

**Created: 2026-07-04**


> Originally written as "Phase 5" when the pipeline scraped a single company (Green Street
> only) via `normalize_green_street.py`. The snapshot-versioning and raw-archive mechanics
> described here are still current, but some script/module names below are historical (the
> normalize step is now `pipeline.normalize`, covering all companies). For the current
> end-to-end commands, see [Phase 5.2 — Data Refresh Runbook](phase-5.2-data-refresh-runbook.md).
> Index: [Phase 5 — Scraper and Normalize Strategy](phase-5-scraper-and-normalize-strategy.md).

## Problem

Every run of `normalize_green_street.py` overwrote `green_street_listings.db`, and every run
of `ingest.py` rebuilt the Chroma vector store from scratch. This meant:

- No historical record of how listings changed over time (prices, availability, new buildings)
- No way to observe scrape-over-scrape deltas (e.g. how fast units get leased)
- Full re-embedding on every run — expensive (~minutes) even when 95% of listings are unchanged

The first historical snapshot was lost before this system was in place (the Jun 13 scrape
overwrote the previous DB). The Jun 13 data is treated as snapshot v1.

## Decision: What Gets Versioned and How

### SQLite — full file snapshots

Each scrape run produces a new `snapshots/listings_YYYY-MM-DD.db`. A `snapshots/latest.txt`
file records the date string of the most recent snapshot. If the new scrape produces data
identical to the previous snapshot, no new file is written and `latest.txt` is unchanged.

Raw JSON is also archived alongside: `snapshots/raw_YYYY-MM-DD.json`.

Why file-per-date and not a single DB with a `scraped_at` column?
- Easier to inspect historical data with DB Browser for SQLite
- No risk of a bad run corrupting previous data
- Trivial to diff two snapshots at the SQL level

If normalize is run twice on the same calendar day, the second run overwrites today's
snapshot only if the data changed (compared against the previous latest, not today's file).

### Raw JSON — date-versioned archive at scrape time

The snapshot archiving above only happens inside `pipeline/normalize.py`, and only when the
normalized data differs from the previous snapshot. That left a gap: running a scraper on its
own overwrote `data/<name>_raw.json` in place, with no backup. A scrape whose data later turned
out to be broken (site layout change, partial run, anti-bot interference) destroyed the last
good raw file before normalize ever saw it.

Each scraper now writes two files on every run:

1. `data/<name>_raw.json` — the canonical "latest raw" file. Unchanged behavior; this is what
   `pipeline/normalize.py` reads via its `data/*_raw.json` glob, so the pipeline is untouched.
2. `data/raw_archive/<name>_raw_YYYY-MM-DD_HHMMSS.json` — a timestamped copy written
   unconditionally on every scrape, independent of the pipeline and independent of whether the
   data changed.

**Mental model (easy to forget):** the two files behave in opposite ways, on purpose.
`data/<name>_raw.json` is a fixed name that gets **overwritten every run** — it always holds
only the newest scrape, per company, and it is the only thing normalize reads. The
`raw_archive/` copies are **never overwritten** — one new timestamped file is added per company
per run, so running the same scraper twice on one day leaves two archive files but still just
one (latest) `data/<name>_raw.json`. In short: the archive accumulates history; the canonical
file is a pointer to "latest," and normalize follows that pointer.

This makes the raw scrape itself the first line of historical defense, before normalization or
diffing. The archive lives in its own `data/raw_archive/` subdirectory so it never collides with
normalize's non-recursive `data/*_raw.json` glob (a dated file would otherwise be double-counted).

The archive filename carries a full timestamp down to the second, not just the date. A raw
scrape is a factual record of what the site returned at a moment in time, so every run is
preserved as its own file — even two runs on the same calendar day never overwrite each other.
This is deliberately different from the snapshot layer: snapshots are deduplicated by content
(no new `.db` if nothing changed), because their job is to track *meaningful* deltas in listings.
The raw archive's job is the opposite: keep every scrape verbatim, so a bad or partial run can
always be compared against or rolled back to a known-good earlier one.

The archive is a local safety net (regenerable), so `data/raw_archive/` is gitignored; the
committed historical record still lives in `snapshots/`.

### Chroma — single directory, incremental updates

Chroma stays as one directory (`chroma_db/`). Each ingest run computes a stable document ID
per listing, then applies only the minimal diff:

- **New listing** → `add`
- **Changed listing** (price, availability, etc.) → `delete` old + `add` new
- **Disappeared listing** → `delete`
- **Unchanged listing** → skip entirely (no re-embedding)

Why not version Chroma directories too?
- Chroma DBs are large binary files; keeping N copies is wasteful
- The SQLite snapshots already preserve the historical record — Chroma is just the search
  index and only needs to reflect the current truth
- Incremental updates are fast enough that there's no reason to keep stale indices around

## Stable Document ID

```python
hashlib.md5(f"{address}|{unit_type}".encode()).hexdigest()
```

`address + unit_type` uniquely identifies a floor plan within a building. Same building,
different bedroom count = different document. Same address + unit_type with a changed price
= same ID, existing vector is replaced.

## Directory Layout

```
data/
  green_street_raw.json                        ← canonical latest raw (read by normalize)
  universities_group_raw.json
  raw_archive/                                 ← timestamped copy written on every scrape
    green_street_raw_2026-07-01_091500.json
    green_street_raw_2026-07-01_170322.json    ← same day, second run — kept, not overwritten
    universities_group_raw_2026-07-01_093011.json
    ...
snapshots/
  latest.txt                  ← contains "2026-06-13" (the latest date string)
  raw_2026-06-13.json         ← archived raw scrape output (written by normalize, on change)
  listings_2026-06-13.db      ← normalized SQLite snapshot (v1, first ever)
  raw_2026-07-01.json         ← next scrape (example)
  listings_2026-07-01.db
  ...
chroma_db/                    ← single Chroma index, incrementally maintained
```

## Pipeline Run Order (unchanged)

```bash
python scrapers/green_street.py             # → green_street_raw.json
python -m pipeline.normalize_green_street   # → snapshots/listings_YYYY-MM-DD.db
python -m pipeline.ingest                   # → incremental update to chroma_db/
```

## Live Sidebar Metadata — `GET /api/status`

After each pipeline run the snapshot directory is the source of truth for listing counts and
scrape date. The frontend Sidebar used to hardcode these values; now it fetches them live.

**Endpoint:** `GET /api/status`

**Response:**
```json
{
  "last_scraped": "2026-06-13",
  "listing_count": 490,
  "property_count": 251
}
```

**How it works (backend):**
1. Reads `snapshots/latest.txt` to get the most recent date string.
2. Opens `snapshots/listings_<date>.db` and runs:
   ```sql
   SELECT COUNT(*), COUNT(DISTINCT address) FROM listings
   ```
3. Returns the counts + date. If either file is missing, the missing fields come back as `null`.

**How it works (frontend):**
- `Sidebar.tsx` calls `fetchStatus()` on mount via `useEffect`.
- Shows `"—"` until the response arrives (no flash of stale hardcoded data).
- `last_scraped` is formatted with `toLocaleDateString` so `"2026-06-13"` renders as
  `"June 13, 2026"`.

**Why this belongs in Phase 5:**  
The snapshot system is what makes the counts meaningful — before Phase 5 there was no
authoritative record of how many listings existed or when they were last scraped. The sidebar
is simply exposing the metadata the snapshot system already tracks.

## What We Discussed and Ruled Out

**Option: version Chroma directories too**
Ruled out — storage cost is high, SQLite snapshots already cover the historical record.

**Option: single SQLite with scraped_at column**
Ruled out — harder to diff, riskier (one bad write could corrupt all history).

**Option: full re-embed on every run**
Ruled out — the original behavior. Re-embedding 500+ listings takes minutes and is wasteful
when only a handful of units change availability between scrapes.

**Option: use `address` alone as Chroma ID**
Ruled out — one building has multiple floor plans (1BR, 2BR, 3BR), each is a separate
document. The ID must include `unit_type` to be unique per floor plan.
