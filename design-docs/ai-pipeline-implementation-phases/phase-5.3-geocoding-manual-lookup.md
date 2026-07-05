# Phase 5.3 — Geocoding Manual Lookup

**Created: 2026-06-28**

> Part of [Phase 5 — Scraper and Normalize Strategy](phase-5-scraper-and-normalize-strategy.md). Covers `pipeline/geocode.py`, the step run after [Phase 5.2](phase-5.2-data-refresh-runbook.md)'s normalize step and before ingest.

## Overview

`pipeline/geocode.py` geocodes listing addresses via Nominatim (OpenStreetMap). For addresses Nominatim cannot resolve correctly, `MANUAL_COORDS` provides a hardcoded override table. This document explains why those overrides exist, the root causes of each failure mode, and how to add new entries.

---

## How MANUAL_COORDS Works

```python
def geocode(address: str) -> tuple[float, float] | None:
    manual = manual_lookup(address)   # checked FIRST — Nominatim never called if matched
    if manual:
        return manual
    ...  # Nominatim fallback
```

`manual_lookup()` does substring matching: if any key in `MANUAL_COORDS` appears inside the raw address string, it returns the hardcoded coordinates immediately. Key selection matters — see the entry guidelines below.

---

## Root Cause Analysis: Three Failure Modes

### Failure Mode 1 — Champaign County Ambiguity

**Affected address:** `409 S 3rd St, Champaign`

`clean_address()` produces `"409 S 3rd St, Champaign, IL"` and sends it to Nominatim. Nominatim interprets `"Champaign"` as Champaign County rather than the city of Champaign. It finds South 3rd Street in **Fisher, IL** — a village within Champaign County — and returns those coordinates (~40.314, -88.349), placing the pin near Rantoul.

**Fix:** Add explicit entry in `MANUAL_COORDS` using a key that is a substring of the address. The city-vs-county ambiguity is a Nominatim structural limitation and cannot be fixed by tweaking the query string alone.

---

### Failure Mode 2 — Fraction in Address (`1/2`)

**Affected address:** `56 1/2 E Green St, Champaign, IL 61820`

The `1/2` fraction in the house number breaks Nominatim's address parser. `clean_address()` does not normalize fractional addresses, so Nominatim receives the string as-is. Unable to parse it, Nominatim falls back to a distant best-guess match — in this case, a street in **Bulgaria** (~42.44, 25.63).

**Fix:** `MANUAL_COORDS` entry using key `"56 1/2 E Green"`. The correct coordinates are the same as the adjacent `"56 E Green"` (same block).

---

### Failure Mode 3 — Em-Dash Suffix Strips the City Name

**Affected addresses:** `60 E Green – Roommate Matching Special!`, `60 E. Green – May/June Special!`

The scraper stores these addresses without a city name — the em-dash suffix is a marketing tag appended directly after the street name. `clean_address()` correctly strips the em-dash and everything after it, but this leaves the address with no city:

```
Input:   "60 E Green – Roommate Matching Special!"
          ↓  strip em-dash suffix
          "60 E Green"
          ↓  no "IL" found → append ", IL"
Sent:    "60 E Green, IL"
```

Nominatim receives `"60 E Green, IL"` with no city constraint and matches a different E Green Street in central Illinois (~40.648, -88.844), placing the pin near Bloomington/Normal.

**Fix:** `MANUAL_COORDS` entries using keys that include the em-dash character (`"60 E Green –"`, `"60 E. Green"`), so they match only the marketing-suffix variants and not the correctly-geocoded `"60 E Green St, Champaign"`.

**Recurrence (2026-07-05):** `502 S. Fifth – Fall Semester Only!` (a Universities Group listing at `.../502-e-healey-january-2024`) hit the same pattern — the em-dash strip left `"502 S. Fifth, IL"` with no city, and Nominatim matched a Fifth street in Chicago (~41.878, -87.711) instead of Champaign. Fixed with a `"502 S. Fifth –"` entry, coordinates verified via Google Maps.

---

## Summary of Failure Modes

| Failure Mode | Root Cause | Example Address | Bad Result |
|---|---|---|---|
| County ambiguity | Nominatim reads "Champaign" as Champaign County | `409 S 3rd St, Champaign` | Fisher, IL (~40.314) |
| Fraction in address | `1/2` breaks Nominatim's parser | `56 1/2 E Green St` | Bulgaria (~42.44, 25.63) |
| Em-dash strips city name | Marketing suffix removal discards city | `60 E Green – Roommate Matching Special!` | Bloomington/Normal area (~40.648) |

---

## How to Diagnose a Bad Geocode

When a map pin appears far outside Champaign-Urbana:

1. **Query the DB** for the address and inspect its `lat`/`lng`:
   ```bash
   python3 -c "
   import sqlite3; from pipeline.ingest import get_latest_db
   conn = sqlite3.connect(get_latest_db())
   print(conn.execute(\"SELECT address, lat, lng FROM listings WHERE address LIKE '%KEYWORD%'\").fetchall())
   "
   ```

2. **Check which failure mode applies:**
   - `lat` outside Illinois entirely → Failure Mode 2 or 3 (parser crash or city stripped)
   - `lat` ~40.2–40.5 but still Illinois → Failure Mode 1 or 3 (wrong city/county)

3. **Find correct coordinates** via Nominatim with a more specific query:
   ```bash
   python3 -c "
   import json, urllib.request, urllib.parse
   params = urllib.parse.urlencode({'q': 'ADDRESS, Champaign, Illinois', 'format': 'json', 'limit': 3})
   req = urllib.request.Request('https://nominatim.openstreetmap.org/search?' + params,
         headers={'User-Agent': 'uiuc-housing-assistant/1.0 (sz94@illinois.edu)'})
   print(json.loads(urllib.request.urlopen(req).read()))
   "
   ```
   If Nominatim still fails, look up in Google Maps: right-click on the building → "What's here?" → copy lat/lng.

---

## How to Add a New Manual Entry

1. **Add to `MANUAL_COORDS`** in `pipeline/geocode.py`:
   ```python
   "KEY_SUBSTRING": (lat, lng),  # brief explanation of why
   ```
   - Key must be a substring of the raw address as stored in the DB
   - Key must NOT be a substring of any address that is already correctly geocoded
   - Prefer a specific prefix (e.g., include the em-dash, or the full street number) over a broad one

2. **Fix the current snapshot DB** directly (avoids re-running the full geocode pipeline):
   ```bash
   python3 -c "
   import sqlite3; from pipeline.ingest import get_latest_db
   conn = sqlite3.connect(get_latest_db())
   conn.execute(\"UPDATE listings SET lat=LAT, lng=LNG WHERE address='EXACT_ADDRESS'\")
   conn.commit()
   "
   ```

3. **Re-ingest** to push corrected coordinates to ChromaDB:
   ```bash
   python -m pipeline.ingest
   ```

Future scrapes are automatically protected: `geocode()` checks `MANUAL_COORDS` before calling Nominatim, so the correct coordinates will be written from the start on the next snapshot.

---

## Known Entries

| Key | Coordinates | Address | Reason |
|---|---|---|---|
| `"W. John"` | `(40.10892, -88.26153)` | 1017, 1019 W. John St | Nominatim verified (street-level) |
| `"715 Balboa"` | `(40.09484, -88.25396)` | 715 Balboa Dr | Nominatim verified |
| `"717 Balboa"` | `(40.09484, -88.25401)` | 717 Balboa Dr | Nominatim verified |
| `"813 Balboa"` | `(40.09485, -88.25676)` | 813 Balboa Dr | Nominatim verified |
| `"901 W. Western"` | `(40.11188, -88.21973)` | 901 W. Western Ave, Urbana | Nominatim verified |
| `"302-310 S. 1st"` | `(40.11394, -88.23826)` | 302-310 S. 1st-Midtown Plaza | Nominatim matches Fisher, IL — key must precede `"310 S. 1st"` (substring) |
| `"302 S. 1st"` | `(40.11394, -88.23826)` | 302 S. 1st-Midtown Plaza | Nominatim matches Fisher, IL |
| `"310 S. 1st"` | `(40.11304, -88.23829)` | 310 S. 1st-Midtown Plaza | Nominatim matches Fisher, IL |
| `"309 S. 1st"` | `(40.11321, -88.23906)` | 309 S. 1st Midtown Plaza West | Nominatim matches Fisher, IL |
| `"Stoneway Condos"` | `(40.13209, -88.30133)` | Stoneway Ct, Champaign | Property name only, no street address |
| `"Windsor Duplexes"` | `(40.09383, -88.19336)` | 907 E Harding Dr, Urbana | Property name only, no street address |
| `"409 S 3rd"` | `(40.11329, -88.23551)` | 409 S 3rd St, Champaign | Failure Mode 1: Nominatim matches Fisher, IL in Champaign County |
| `"56 1/2 E Green"` | `(40.11041, -88.23939)` | 56 1/2 E Green St | Failure Mode 2: `1/2` breaks Nominatim, returns Bulgaria |
| `"60 E Green –"` | `(40.11042, -88.23897)` | 60 E Green – Roommate Matching Special! | Failure Mode 3: em-dash strips city name |
| `"60 E. Green"` | `(40.11042, -88.23897)` | 60 E. Green – May/June Special! | Failure Mode 3: em-dash strips city name |
| `"502 S. Fifth –"` | `(40.11261, -88.23181)` | 502 S. Fifth – Fall Semester Only! (url: 502-e-healey-january-2024) | Failure Mode 3: em-dash strips city name; Nominatim matched Chicago (~41.878, -87.711). Verified via Google Maps 2026-07-05 |

---

## Known Bad Geocodes (Unresolved)

These addresses were flagged but not yet corrected. Manual Google Maps lookup required.

| Address | Stored Coords | Problem |
|---|---|---|
| `911 S Locust` | `(40.1069, -88.2407)` | ORS gives ~4 min walk from Green/6th but Google Maps shows ~17 min — wrong street |
| `605 S. Fifth` | `(41.88, -87.71)` | Chicago — Failure Mode 1 or 2 |
| `Helen Ct` | `(42.01, -88.18)` | Dundee, IL — property name without street address |
