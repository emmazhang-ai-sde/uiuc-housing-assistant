# pipeline/geocode.py
# Batch-geocodes all property addresses in the latest snapshot DB using Nominatim.
# Writes lat/lng back into SQLite. Safe to re-run — skips already-geocoded rows.
#
# Run:  python -m pipeline.geocode
# Time: ~410 addresses × 1.1s ≈ 8 minutes

import json
import re
import sqlite3
import time
import urllib.parse
import urllib.request
from pathlib import Path

from pipeline.ingest import get_latest_db

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT    = "uiuc-housing-assistant/1.0 (sz94@illinois.edu)"

# Hardcoded coordinates for addresses Nominatim cannot resolve.
# Nominatim sometimes matches Champaign County villages (Fisher, St. Joseph) instead of
# the city of Champaign — those addresses must be looked up manually in Google Maps.
# Keys are substrings of the raw address; first match wins.
# TODO: fill in the remaining entries via Google Maps before running ingest.
MANUAL_COORDS: dict[str, tuple[float, float]] = {
    # ── FIXME: KNOWN BAD GEOCODES ────────────────────────────────────────────────
    # These addresses were confirmed misgeocoded via ORS walking-distance check:
    # ORS gave ~4 min walk vs Google Maps ~17 min for "911 S Locust" from Green St & 6th.
    # Other two have coordinates outside Champaign entirely (Chicago area / Dundee IL).
    #
    # To fix: open Google Maps → search address → right-click → "What's here?" → copy lat/lng
    # Then add here as:   "911 S Locust":   (40.XXXXX, -88.XXXXX),
    # Then run:  python -c "import sqlite3; ..."   (NULL out lat/lng for these addresses)
    #            python -m pipeline.geocode   (re-geocodes via MANUAL_COORDS)
    #            python -m pipeline.ingest    (pushes updated coords to ChromaDB)
    #
    # "911 S Locust"  — stored (40.1069,-88.2407); actual ~17 min walk from Green/6th
    # "605 S. Fifth"  — stored (41.88,-87.71) = Chicago; should be Champaign
    # "Helen Ct"      — stored (42.01,-88.18) = Dundee IL; should be Champaign
    # ─────────────────────────────────────────────────────────────────────────────
    # Verified via Nominatim (street-level)
    "W. John":        (40.10892, -88.26153),  # 1017, 1019 W. John St
    "715 Balboa":     (40.09484, -88.25396),  # 715 Balboa Dr., Champaign
    "717 Balboa":     (40.09484, -88.25401),  # 717 Balboa Dr., Champaign
    "813 Balboa":     (40.09485, -88.25676),  # 813 Balboa Dr., Champaign
    "901 W. Western": (40.11188, -88.21973),  # 901 W. Western Ave, Urbana
    # S. 1st / Midtown Plaza — Nominatim matches Fisher, IL instead of Champaign;
    # these coords come from querying "S First Street, city=Champaign, state=IL"
    # Order matters: "302-310 S. 1st" must precede "310 S. 1st" (substring of former).
    "302-310 S. 1st": (40.11394, -88.23826),  # 302-310 S. 1st-Midtown Plaza (combined listing)
    "302 S. 1st":     (40.11394, -88.23826),  # 302 S. 1st-Midtown Plaza – Lake Facing Suites
    "310 S. 1st":     (40.11304, -88.23829),  # 310 S. 1st-Midtown Plaza – Move-in Today!
    "309 S. 1st":     (40.11321, -88.23906),  # 309 S. 1st Midtown Plaza West
    # Property names without street addresses — matched by name substring
    "Stoneway Condos": (40.13209, -88.30133), # Stoneway Ct, Champaign IL 61822
    "Windsor Duplexes": (40.09383, -88.19336), # 907 E Harding Dr, Urbana IL 61801
    # Nominatim matches "S 3rd St, Champaign" to Fisher, IL (a village in Champaign County).
    # Correct coordinates from Nominatim "South Third Street, Midtown, Champaign".
    "409 S 3rd": (40.11329, -88.23551),
    # Nominatim matches "56 1/2 E Green St" to Bulgaria (lat 42.44, lng 25.63) — the "1/2"
    # in the address breaks geocoding. Same coords as the correctly-geocoded "56 E Green".
    "56 1/2 E Green": (40.11041, -88.23939),
    # These two addresses have marketing suffixes after an em-dash. clean_address() strips
    # them but leaves "60 E Green, IL" / "60 E. Green, IL" without a city, so Nominatim
    # matches a different E Green St in central Illinois (~40.648). Same coords as the
    # correctly-geocoded "60 E Green St, Champaign".
    # Keys use the em-dash to avoid matching "60 E Green St, Champaign" (already correct).
    "60 E Green –": (40.11042, -88.23897),
    "60 E. Green":     (40.11042, -88.23897),
}


def clean_address(address: str) -> str:
    a = address.strip()
    # Bug 1 fix: scraper stores missing zip as the string "None" separated by a space,
    # not a comma — original regex r',\s*None$' never matched.
    a = re.sub(r'\s+None\b', '', a)
    # Strip em-dash suffixes — always a marketing note, never an address component:
    # "60 E Green – Roommate Matching Special!" → "60 E Green"
    a = re.sub(r'\s*–.*$', '', a)
    # Strip " - NOTE" suffixes where NOTE doesn't start with a digit or compass direction.
    # Preserves address ranges like "302-310" and street names like "N. First-Second Ave".
    # "75 E. Armory, Champaign - Immediate Move in" → "75 E. Armory, Champaign"
    a = re.sub(r'\s+-\s+(?![0-9NSEW]).*$', '', a)
    # Strip no-space "-ALLCAPS" marketing tags: "Champaign-ROOMMATE MATCHING"
    a = re.sub(r'-[A-Z]{2,}.*$', '', a)
    # For slash-joined multi-addresses, keep only the first: "1108 S. Lincoln/810 W. Indiana"
    if '/' in a:
        a = a.split('/')[0].strip()
    # Remove unit designators that confuse Nominatim: "Unit #B", "#7"
    a = re.sub(r'\s+(Unit\s+)?#\w+', '', a, flags=re.IGNORECASE)
    # Bug 2 fix: original code appended ", Champaign, IL" even when city was already present
    # (e.g. "901 W. Western Ave, Urbana" → wrong city added). Now append only ", IL".
    if not re.search(r'\bIL\b', a):
        a = a.rstrip(',').strip() + ', IL'
    return a.strip()


def manual_lookup(address: str) -> tuple[float, float] | None:
    for key, coords in MANUAL_COORDS.items():
        if key in address:
            return coords
    return None


# Geocodes a single address using Nominatim API. Returns (lat, lng) or None if not found.
def geocode(address: str) -> tuple[float, float] | None:
    manual = manual_lookup(address)
    if manual:
        return manual
    params = urllib.parse.urlencode({"q": clean_address(address), "format": "json", "limit": 1})
    req = urllib.request.Request(
        f"{NOMINATIM_URL}?{params}",
        headers={"User-Agent": USER_AGENT},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read())
    if data:
        return float(data[0]["lat"]), float(data[0]["lon"])
    return None


# Main batch geocoding function. Reads addresses from DB, geocodes, and updates DB.
def main():
    db_path = get_latest_db()
    conn = sqlite3.connect(db_path)

    rows = conn.execute(
        "SELECT DISTINCT address FROM listings WHERE lat IS NULL"
    ).fetchall()

    total   = len(rows)
    success = 0
    failed  = []

    print(f"Geocoding {total} addresses…\n")

    for i, (address,) in enumerate(rows, 1):
        try:
            result = geocode(address)
        except Exception as e:
            print(f"  [{i}/{total}] ✗  {address}  ({e})")
            failed.append(address)
            time.sleep(1.1)
            continue

        if result:
            lat, lng = result
            conn.execute(
                "UPDATE listings SET lat=?, lng=? WHERE address=?",
                (lat, lng, address),
            )
            conn.commit()
            print(f"  [{i}/{total}] ✓  {address}  →  {lat:.5f}, {lng:.5f}")
            success += 1
        else:
            print(f"  [{i}/{total}] ✗  {address}  — not found")
            failed.append(address)

        time.sleep(1.1)

    conn.close()

    print(f"\nDone. {success}/{total} geocoded successfully.")
    if failed:
        print(f"\nFailed ({len(failed)}):")
        for addr in failed:
            print(f"  {addr}")


if __name__ == "__main__":
    main()
