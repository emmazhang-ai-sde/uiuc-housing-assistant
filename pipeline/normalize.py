# normalize.py
# Reads all data/*_raw.json → cleans each field → stores in snapshots/listings_YYYY-MM-DD.db
#
# Run:    python -m pipeline.normalize
# Output: snapshots/listings_YYYY-MM-DD.db  (only if data changed vs last snapshot)
#         snapshots/latest.txt              (updated to new date if snapshot was written)

import hashlib
import json
import re
import shutil
import sqlite3
from datetime import date
from pathlib import Path

DATA_DIR      = Path("data")
SNAPSHOTS_DIR = Path("snapshots")
SNAPSHOTS_DIR.mkdir(exist_ok=True)


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
    """
    if not value:
        return None, None
    numbers = re.findall(r'\d+', str(value))
    if not numbers:
        return None, None
    low  = int(numbers[0])
    high = int(numbers[-1])
    return low, high


def parse_int(value: str) -> int | None:
    try:
        return int(value) if value else None
    except (ValueError, TypeError):
        return None


def parse_float(value: str) -> float | None:
    try:
        return float(value) if value else None
    except (ValueError, TypeError):
        return None


def format_price_range(low: int | None, high: int | None) -> str:
    if low is None:
        return "unknown"
    if low == high:
        return f"${low}"
    return f"${low}–${high}"


# ── Normalizer ───────────────────────────────────────────────────────────────

def normalize(record: dict) -> dict:
    ppb_low,  ppb_high  = parse_price_range(record.get("price_per_bed", ""))
    ptot_low, ptot_high = parse_price_range(record.get("price_total",   ""))

    company      = record.get("company", "").strip()
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
        f"Company: {company}. "
        f"Link: {url}"
    )

    return {
        "company":            company,
        "address":            address,
        "area":               area,
        "property_type":      record.get("property_type", "").strip(),
        "roommate_match":     1 if roommate else 0,
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


# ── Snapshot helpers ──────────────────────────────────────────────────────────

def write_db(normalized: list[dict], db_path: Path) -> None:
    conn = sqlite3.connect(db_path)
    conn.execute("DROP TABLE IF EXISTS listings")
    conn.execute("""
        CREATE TABLE listings (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            company             TEXT,
            address             TEXT,
            area                TEXT,
            property_type       TEXT,
            roommate_match      INTEGER,
            unit_type           TEXT,
            beds                INTEGER,
            baths               REAL,
            sqft                INTEGER,
            price_per_bed_low   INTEGER,
            price_per_bed_high  INTEGER,
            price_total_low     INTEGER,
            price_total_high    INTEGER,
            availability        TEXT,
            url                 TEXT,
            text                TEXT
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
    conn.close()


def db_fingerprint(db_path: Path) -> str:
    """MD5 of all content rows, sorted for stable comparison."""
    conn = sqlite3.connect(db_path)
    rows = conn.execute(
        "SELECT address, unit_type, beds, baths, sqft, "
        "price_per_bed_low, price_per_bed_high, "
        "price_total_low, price_total_high, availability, url "
        "FROM listings ORDER BY address, unit_type"
    ).fetchall()
    conn.close()
    return hashlib.md5(str(rows).encode()).hexdigest()


def get_latest_date() -> str | None:
    latest_file = SNAPSHOTS_DIR / "latest.txt"
    return latest_file.read_text().strip() if latest_file.exists() else None


def print_summary(db_path: Path) -> None:
    conn = sqlite3.connect(db_path)
    total      = conn.execute("SELECT COUNT(*) FROM listings").fetchone()[0]
    available  = conn.execute("SELECT COUNT(*) FROM listings WHERE availability != 'Leased'").fetchone()[0]
    leased     = conn.execute("SELECT COUNT(*) FROM listings WHERE availability  = 'Leased'").fetchone()[0]
    with_price = conn.execute("SELECT COUNT(*) FROM listings WHERE price_per_bed_low IS NOT NULL").fetchone()[0]
    null_price = conn.execute("SELECT COUNT(*) FROM listings WHERE price_per_bed_low IS NULL").fetchone()[0]

    # Per-company breakdown
    companies = conn.execute(
        "SELECT company, COUNT(*) FROM listings GROUP BY company ORDER BY company"
    ).fetchall()
    conn.close()

    print(f"   Total     : {total}  |  Available : {available}  |  Leased : {leased}")
    print(f"   Has price : {with_price}  |  No price  : {null_price}")
    for company, count in companies:
        print(f"   {company}: {count}")


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    today       = date.today().isoformat()
    new_db      = SNAPSHOTS_DIR / f"listings_{today}.db"
    latest_date = get_latest_date()

    # Load all raw JSON files from data/
    raw_files = sorted(DATA_DIR.glob("*_raw.json"))
    if not raw_files:
        print(f"No *_raw.json files found in {DATA_DIR}/")
        return

    raw: list[dict] = []
    for f in raw_files:
        records = json.loads(f.read_text())
        print(f"Loaded {len(records):>4} records from {f}")
        raw.extend(records)
    print(f"Total: {len(raw)} records\n")

    normalized = [normalize(r) for r in raw]

    # Write candidate DB
    write_db(normalized, new_db)
    new_fp = db_fingerprint(new_db)

    # Compare with previous snapshot
    if latest_date and latest_date != today:
        prev_db = SNAPSHOTS_DIR / f"listings_{latest_date}.db"
        if prev_db.exists() and db_fingerprint(prev_db) == new_fp:
            new_db.unlink()
            print(f"✅ No changes vs snapshot {latest_date} — nothing written.")
            return

    # Data changed (or first ever run): commit this snapshot
    for f in raw_files:
        shutil.copy(f, SNAPSHOTS_DIR / f"raw_{today}_{f.name}")
    (SNAPSHOTS_DIR / "latest.txt").write_text(today)

    if latest_date and latest_date != today:
        print(f"📸 New snapshot: {new_db}  (previous: {latest_date})")
    else:
        print(f"📸 Snapshot written: {new_db}")

    print_summary(new_db)
    print(f"\nRun next:  python -m pipeline.ingest")


if __name__ == "__main__":
    main()
