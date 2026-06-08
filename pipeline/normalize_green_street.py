# normalize_green_street.py
# Reads green_street_raw.json → cleans each field → stores in green_street_listings.db (SQLite)
#
# Run:    python normalize_green_street.py
# Output: green_street_listings.db

import json # for reading the raw JSON file
import re # for parsing price ranges with regex
import sqlite3 # for storing normalized data in a SQLite database

INPUT_FILE = "green_street_raw.json"
DB_FILE    = "green_street_listings.db"


# ── Helpers ──────────────────────────────────────────────────────────────────

def parse_price_range(value: str) -> tuple[int | None, int | None]:
    """
    Parse a price string into a (low, high) integer pair.

    Single value  → both bounds are the same number:
        "900"       → (900, 900)
        "1650"      → (1650, 1650)

    Range value   → split into low and high:
        "875-900"   → (875, 900)
        "3500-3600" → (3500, 3600)

    Empty / unparseable → (None, None)

    Why two columns instead of one lower bound?
    Showing only the low price and hiding the upper bound misleads users —
    they click expecting $875 and find $900. Both numbers go into the DB so
    the UI and the RAG chain can display the honest range, and price filters
    can use the HIGH column to guarantee no surprises (e.g. WHERE
    price_per_bed_high <= 900).
    """
    if not value:
        return None, None
    numbers = re.findall(r'\d+', str(value))
    if not numbers:
        return None, None
    low  = int(numbers[0])
    high = int(numbers[-1])   # same as low when only one number is found
    return low, high


def parse_int(value: str) -> int | None:
    """Convert a string to int; return None if empty or non-numeric."""
    try:
        return int(value) if value else None
    except (ValueError, TypeError):
        return None


def parse_float(value: str) -> float | None:
    """Convert a string to float; return None if empty or non-numeric."""
    try:
        return float(value) if value else None
    except (ValueError, TypeError):
        return None


def format_price_range(low: int | None, high: int | None) -> str:
    """
    Format a (low, high) pair into a human-readable string for the RAG text chunk.

        (900, 900)   → "$900"
        (875, 900)   → "$875–$900"
        (None, None) → "unknown"
    """
    if low is None:
        return "unknown"
    if low == high:
        return f"${low}"
    return f"${low}–${high}"


# ── Normalizer ───────────────────────────────────────────────────────────────

def normalize(record: dict) -> dict:
    """Clean and type-cast one raw record into the target schema."""

    ppb_low,  ppb_high  = parse_price_range(record.get("price_per_bed", ""))
    ptot_low, ptot_high = parse_price_range(record.get("price_total",   ""))

    # Re-compose the RAG text chunk with honest price ranges instead of bare numbers.
    # Richer, accurate text = better retrieval quality AND no misleading prices.
    address      = record.get("address", "").strip()
    unit_type    = record.get("unit_type", "").strip()
    beds         = record.get("beds", "")
    baths        = record.get("baths", "")
    sqft         = record.get("sqft", "")
    availability = record.get("availability", "").strip()
    area         = record.get("area", "").strip()
    roommate     = record.get("roommate_match", False)
    url          = record.get("url", "").strip()

    text = (
        f"{address}. "
        f"{unit_type}: {beds} bed, {baths} bath"
        f"{', ' + sqft + ' sqft' if sqft else ''}. "
        f"Price: {format_price_range(ppb_low, ppb_high)}/bed per month, "
        f"{format_price_range(ptot_low, ptot_high)}/month total. "
        f"Availability: {availability}. "
        f"Area: {area}. "
        f"{'Roommate match available. ' if roommate else ''}"
        f"Company: Green Street Realty. "
        f"Link: {url}"
    )

    return {
        "company":            record.get("company", "Green Street Realty"),
        "address":            address,
        "area":               area,
        "property_type":      record.get("property_type", "").strip(),
        "roommate_match":     1 if roommate else 0,   # SQLite has no bool type
        "unit_type":          unit_type,
        "beds":               parse_int(beds),
        "baths":              parse_float(baths),
        "sqft":               parse_int(sqft),
        "price_per_bed_low":  ppb_low,
        "price_per_bed_high": ppb_high,
        "price_total_low":    ptot_low,
        "price_total_high":   ptot_high,
        "availability":       availability,
        "url":                url,
        "text":               text,
    }


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    # Load raw data
    with open(INPUT_FILE) as f:
        raw = json.load(f)
    print(f"Loaded {len(raw)} records from {INPUT_FILE}")

    # Normalize every record
    normalized = [normalize(r) for r in raw]

    # Write to SQLite
    conn = sqlite3.connect(DB_FILE)

    # Drop and recreate so re-running always produces a clean, fresh DB
    conn.execute("DROP TABLE IF EXISTS listings")
    conn.execute("""
        CREATE TABLE listings (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            company             TEXT,
            address             TEXT,
            area                TEXT,     -- "on-campus", "downtown", etc.
            property_type       TEXT,     -- "Apartment", etc.
            roommate_match      INTEGER,  -- 0 or 1
            unit_type           TEXT,     -- "1 Bedroom", "2 Bedroom", etc.
            beds                INTEGER,
            baths               REAL,
            sqft                INTEGER,
            price_per_bed_low   INTEGER,  -- lower bound (or exact if no range)
            price_per_bed_high  INTEGER,  -- upper bound (same as low if no range)
            price_total_low     INTEGER,  -- lower bound (or exact if no range)
            price_total_high    INTEGER,  -- upper bound (same as low if no range)
            availability        TEXT,     -- "Available August 2026" or "Leased"
            url                 TEXT,
            text                TEXT      -- pre-composed RAG chunk for embedding
        )
    """)

    conn.executemany("""
        INSERT INTO listings
            (company, address, area, property_type, roommate_match,
             unit_type, beds, baths, sqft,
             price_per_bed_low, price_per_bed_high,
             price_total_low,   price_total_high,
             availability, url, text)
        VALUES
            (:company, :address, :area, :property_type, :roommate_match,
             :unit_type, :beds, :baths, :sqft,
             :price_per_bed_low, :price_per_bed_high,
             :price_total_low,   :price_total_high,
             :availability, :url, :text)
    """, normalized)

    conn.commit()

    # Print a summary so you can spot-check before moving to ingest.py
    total      = conn.execute("SELECT COUNT(*) FROM listings").fetchone()[0]
    available  = conn.execute("SELECT COUNT(*) FROM listings WHERE availability != 'Leased'").fetchone()[0]
    leased     = conn.execute("SELECT COUNT(*) FROM listings WHERE availability  = 'Leased'").fetchone()[0]
    with_price = conn.execute("SELECT COUNT(*) FROM listings WHERE price_per_bed_low IS NOT NULL").fetchone()[0]
    null_price = conn.execute("SELECT COUNT(*) FROM listings WHERE price_per_bed_low IS NULL").fetchone()[0]
    has_range  = conn.execute("SELECT COUNT(*) FROM listings WHERE price_per_bed_low != price_per_bed_high AND price_per_bed_low IS NOT NULL").fetchone()[0]

    print(f"\n✅ Stored {total} listings in {DB_FILE}")
    print(f"   Available : {available}  |  Leased     : {leased}")
    print(f"   Has price : {with_price}  |  No price   : {null_price}")
    print(f"   Price ranges (low ≠ high): {has_range}")
    print(f"\nOpen with DB Browser for SQLite to verify the data looks right.")

    conn.close()


if __name__ == "__main__":
    main()
