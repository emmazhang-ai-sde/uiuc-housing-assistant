# Phase 5 — Snapshot Versioning & Incremental Chroma Updates

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
snapshots/
  latest.txt                  ← contains "2026-06-13" (the latest date string)
  raw_2026-06-13.json         ← archived raw scrape output
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
