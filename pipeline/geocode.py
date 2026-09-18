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

from config import SNAPSHOTS_DIR

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT    = "uiuc-housing-assistant/1.0 (sz94@illinois.edu)"


def get_latest_db() -> Path:
    latest_file = Path(SNAPSHOTS_DIR) / "latest.txt"
    if not latest_file.exists():
        raise FileNotFoundError("No snapshot found in snapshots/. Run pipeline.normalize first.")
    date_str = latest_file.read_text().strip()
    db_path = Path(SNAPSHOTS_DIR) / f"listings_{date_str}.db"
    if not db_path.exists():
        raise FileNotFoundError(f"Snapshot DB not found: {db_path}")
    return db_path

# Hardcoded coordinates for addresses Nominatim cannot resolve.
# Nominatim sometimes matches Champaign County villages (Fisher, St. Joseph) instead of
# the city of Champaign — those addresses must be looked up manually in Google Maps.
# Keys are substrings of the raw address; first match wins.
# TODO: fill in the remaining entries via Google Maps before running ingest.
MANUAL_COORDS: dict[str, tuple[float, float]] = {
    # ── FIXME: KNOWN BAD GEOCODES ────────────────────────────────────────────────
    # To fix: open Google Maps → search address → right-click → "What's here?" → copy lat/lng
    # Then add here as:   "911 S Locust":   (40.XXXXX, -88.XXXXX),
    # Then run:  python -c "import sqlite3; ..."   (NULL out lat/lng for these addresses)
    #            python -m pipeline.geocode   (re-geocodes via MANUAL_COORDS)
    #
    # "911 S Locust"  — stored (40.1069,-88.2407); ORS walking check said ~4 min from
    #                   Green/6th vs Google Maps ~17 min, BUT Nominatim's house-number
    #                   match (2026-08-05, structured query) returns the same coords —
    #                   needs a Google Maps manual lookup to settle.
    # "605 S. Fifth –" and "Helen Ct" — fixed 2026-08-05, see entries below.
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
    # "502 S. Fifth – Fall Semester Only!" (url: 502-e-healey-january-2024) — same
    # failure mode as the "60 E Green –" cases above: stripping the em-dash marketing
    # suffix leaves no city, so Nominatim matched a "Fifth" street in Chicago
    # (41.8776, -87.7107) instead of Champaign. Verified via Google Maps 2026-07-05.
    # Em-dash key so this doesn't match the correctly-geocoded sibling listing
    # "502 S. Fifth, Champaign" (different URL, already resolves correctly).
    "502 S. Fifth –": (40.11261, -88.23181),
    # MHM lists this as "101 E. Armory Street" but the street is Armory AVENUE —
    # Nominatim finds nothing for "Armory Street". Coords from Nominatim
    # "101 E Armory Ave, Champaign, IL" (Frat Park, Campustown). Verified 2026-07-05.
    "101 E. Armory": (40.10515, -88.23844),
    # "59/61 E. Chalmers, Champaign, IL" (no "St" suffix) made Nominatim fall back
    # to a street-segment match ~0.9km east (lng -88.2289, near Sixth St) instead of
    # the address point near First St. Coords from Nominatim with the "St" suffix
    # ("61 E Chalmers St" → house-number match in Seniorland). Verified 2026-07-05.
    "59 E. Chalmers": (40.10636, -88.23925),
    "61 E. Chalmers": (40.10636, -88.23912),
    # "707 S 4th St., Champaign, IL" matched the Champaign City Building downtown
    # (40.116, -88.243) — the numeral "4th" defeats Nominatim. Spelled out,
    # "707 S Fourth St, Champaign, IL" returns the Seven07 building itself
    # (Frat Park, Campustown). Verified 2026-07-05.
    "707 S 4th": (40.10964, -88.23411),
    # "101 E. Springfield - Fall Semester Only!" — marketing suffix strips the city,
    # so Nominatim matched Springfield, IL (39.799, -89.644). Same coords as the
    # correctly-geocoded sibling listing "101 E. Springfield, Champaign".
    # Hyphen-suffix key so it doesn't shadow the sibling. Verified 2026-08-05.
    "101 E. Springfield - Fall": (40.112548, -88.238556),
    # "1008 W. Main – Individual Lease" — same em-dash failure mode; Nominatim matched
    # a W Main St near Illiopolis, IL (39.931, -89.066). Same coords as the
    # correctly-geocoded sibling "1008 W. Main, Urbana". Verified 2026-08-05.
    "1008 W. Main –": (40.1146906, -88.2213552),
    # "25 E John, Champaign" (no "St" suffix) fell back to a street-segment match
    # ~8 km east (lng -88.142). Coords from structured Nominatim query
    # "25 East John Street, city=Champaign, state=Illinois" (Campustown house-number
    # match, consistent with neighbors 48/57/58 E John). Verified 2026-08-05.
    "25 E John": (40.1087788, -88.2412091),
    # "605 S. Fifth – 1 Bedroom" — em-dash failure mode (see "502 S. Fifth –" above);
    # Nominatim matched a Fifth street in Chicago (41.878, -87.711). Coords from
    # structured Nominatim query "605 South Fifth Street, city=Champaign" —
    # house-number match in Midtown. Was a FIXME above since ~2026-06. Em-dash key
    # so it doesn't shadow the sibling "605 S. Fifth, Champaign". Verified 2026-08-05.
    "605 S. Fifth –": (40.1109773, -88.2323923),
    # "Helen Ct/Duncan Rd/Kirby Ave Townhomes" — property name, not an address;
    # Nominatim matched a Helen Ct in Dundee, IL (42.012, -88.184). Coords from
    # structured Nominatim query "Helen Court, city=Champaign" (Holiday Park,
    # SW Champaign — consistent with the Duncan/Kirby location). Was a FIXME
    # above since ~2026-06. Verified 2026-08-05.
    "Helen Ct": (40.0992158, -88.2947863),
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
    # Spell out numbered street names — Nominatim maps "S 1st St, Champaign" to
    # Fisher IL (or the City Building) but resolves "S First St" correctly.
    # Only ordinals followed by a street suffix are touched, so "1st floor" notes
    # or ranges like "302-310" are unaffected. Verified 2026-07-05 (Roland batch).
    ordinals = {"1st": "First", "2nd": "Second", "3rd": "Third", "4th": "Fourth",
                "5th": "Fifth", "6th": "Sixth", "7th": "Seventh", "8th": "Eighth",
                "9th": "Ninth"}
    a = re.sub(
        r'\b(1st|2nd|3rd|4th|5th|6th|7th|8th|9th)\b(?=\s+(?:St|Street|Ave|Avenue)\b)',
        lambda m: ordinals[m.group(1).lower()], a, flags=re.IGNORECASE,
    )
    # Half-number house numbers ("907.5 S Oak St") fall back to the City Building —
    # use the whole number; the neighboring coordinate is close enough for the map.
    a = re.sub(r'\b(\d+)\.5\b', r'\1', a)
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
