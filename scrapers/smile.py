# scrapers/smile.py
# Smile Student Living — UIUC Housing Scraper
#
# Strategy:
#   The site (smilestudentliving.com, Duda-built) renders its /availability page
#   with an AppFolio listings widget backed by a public Duda Collections JSON
#   endpoint — no cookies, no JS, no bot protection. One requests call returns
#   every listing with address, beds/baths/sqft, rent, availability, amenities,
#   photos, and exact lat/lng, so no Playwright and no crawl delay are needed.
#
#   Pricing rule: for 2+ bedroom units, AppFolio's market_rent is the PER-BED
#   price (listing descriptions carry "Prices displayed are for individual
#   leases" / "priced per person" boilerplate), so price_total = rent × beds.
#   Studios and 1-bedrooms: per-bed == total == rent.
#
#   lat/lng from the feed are written into each raw record; pipeline/normalize.py
#   passes them into the snapshot DB so pipeline/geocode.py skips Smile entirely.
#
#   Failure model: all-or-nothing. A failed request exits nonzero and writes
#   nothing, so the output can never mix fresh and stale data. No retry modes.
#   See design-docs/ai-pipeline-implementation-phases/phase-9.1-smile-scraper.md
#
# Run:    python scrapers/smile.py
# Output: data/smile_raw.json                                (canonical latest, read by normalize)
#         data/raw_archive/smile_raw_YYYY-MM-DD_HHMMSS.json  (timestamped archive, every run)
# Save/archive logic lives in scrapers/_archive.py

import html
import re
from datetime import date, datetime

import requests

from _archive import save_scrape

API_URL = (
    "https://www.smilestudentliving.com/rts/collections/public/0af4bf1b/"
    "runtime/collection/appfolio-listings/query-data"
)
PAGE_SIZE  = 100
COMPANY    = "Smile Student Living"
DETAIL_URL = "https://fairlawn.appfolio.com/listings/detail/{uid}"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

# Smile's own named neighborhoods, mentioned in each listing's marketing text
# ("...apartment in Midtown neighborhood..."). Matched case-insensitively,
# first hit wins. "Quadview" appears both spaced and as one word; listings that
# only say "near Krannert" are in Smile's Art District (their /art-district page:
# "home to the Krannert Center, Spurlock Museum, and Gregory Street restaurants").
KNOWN_AREAS = [
    ("art district", "Art District"),
    ("engineering",  "Engineering"),
    ("gradland",     "Gradland"),
    ("midtown",      "Midtown"),
    ("quad view",    "Quad View"),
    ("quadview",     "Quad View"),
    ("seniorland",   "Seniorland"),
    ("krannert",     "Art District"),
]

# Boilerplate that marks a listing as priced per bedroom / leased by the room.
PER_PERSON_RE = re.compile(
    r"individual lease|priced per person|per person|per bedroom", re.IGNORECASE
)


# ── Fetch ─────────────────────────────────────────────────────────────────────

def fetch_all() -> list[dict]:
    """Page through the Duda collection endpoint until a short page is returned."""
    records: list[dict] = []
    page = 0
    while True:
        resp = requests.get(
            API_URL,
            params={
                "pageSize":   PAGE_SIZE,
                "pageNumber": page,
                "query":      "()",
                "language":   "ENGLISH",
            },
            headers={"User-Agent": USER_AGENT},
            timeout=30,
        )
        resp.raise_for_status()
        values = resp.json()["values"]
        records.extend(v["data"] for v in values)
        if len(values) < PAGE_SIZE:
            return records
        page += 1


# ── Field helpers ─────────────────────────────────────────────────────────────

def clean_text(s: str | None) -> str:
    """Strip HTML tags/entities and collapse whitespace."""
    if not s:
        return ""
    s = re.sub(r"<br\s*/?>", " ", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def fmt_num(x) -> str:
    """3.0 → '3', 2.5 → '2.5', None → ''."""
    if x in (None, ""):
        return ""
    f = float(x)
    return str(int(f)) if f == int(f) else str(f)


def rent_bounds(r: dict) -> tuple[int, int]:
    """(low, high) rent from rent_range when present, else market_rent."""
    rr = r.get("rent_range")
    if isinstance(rr, list) and len(rr) == 2:
        return int(float(rr[0])), int(float(rr[1]))
    rent = int(float(r.get("market_rent") or 0))
    return rent, rent


def price_str(low: int, high: int) -> str:
    return str(low) if low == high else f"{low}-{high}"


def parse_area(text: str) -> str:
    t = text.lower()
    for key, name in KNOWN_AREAS:
        if key in t:
            return name
    return ""


def availability_strings(avail_date: str | None) -> tuple[str, str]:
    """('Available August 21, 2026', 'Available August 2026') from '2026-08-21'."""
    if not avail_date:
        return "", ""
    d = datetime.strptime(avail_date, "%Y-%m-%d").date()
    if d <= date.today():
        return "Available now", "Available now"
    return f"Available {d.strftime('%B')} {d.day}, {d.year}", f"Available {d.strftime('%B %Y')}"


# ── Record mapping ────────────────────────────────────────────────────────────

def to_record(r: dict) -> dict:
    beds_n    = int(r.get("bedrooms") or 0)
    low, high = rent_bounds(r)

    title = clean_text(r.get("marketing_title"))
    desc  = clean_text(r.get("marketing_description"))
    blob  = f"{title} {desc}"

    # Multi-bed rents are per bedroom (see module docstring / phase-9.1 doc).
    if beds_n >= 2:
        price_per_bed = price_str(low, high)
        price_total   = price_str(low * beds_n, high * beds_n)
    else:
        price_per_bed = price_str(low, high)
        price_total   = price_str(low, high)

    # AppFolio template names are mostly clean ("2 Bed 2 Bath") but a few leak
    # internal bookkeeping ("BTB - 4x2 (Obsolete unit type - CW)") — derive those.
    unit_type = clean_text(r.get("unit_template_name"))
    if not unit_type or "obsolete" in unit_type.lower():
        unit_type = "Studio" if beds_n == 0 else f"{beds_n} Bedroom"

    address = f"{r.get('address_address1', '').strip()}, {r.get('address_city', '').strip()}"
    availability, availability_summary = availability_strings(r.get("available_date"))
    area = parse_area(blob)

    photos    = r.get("photos") or []
    photo_url = r.get("default_photo_thumbnail_url") or (photos[0]["url"] if photos else "")

    return {
        "company":              COMPANY,
        "address":              address,
        "area":                 area,
        "property_type":        "Apartment",
        "roommate_match":       bool(PER_PERSON_RE.search(blob)),
        "unit_type":            unit_type,
        "beds":                 str(beds_n),
        "baths":                fmt_num(r.get("bathrooms")),
        "sqft":                 fmt_num(r.get("square_feet")),
        "price_total":          price_total,
        "price_per_bed":        price_per_bed,
        "availability":         availability,
        "url":                  DETAIL_URL.format(uid=r["listable_uid"]),
        "photo_url":            photo_url,
        "availability_summary": availability_summary,
        "tagline":              title,
        "description":          desc,
        "amenities":            clean_text(r.get("amenities")),
        "utility_fees":         clean_text(r.get("utilities")),
        "lat":                  r.get("address_latitude"),
        "lng":                  r.get("address_longitude"),
        "text": (
            f"{address}. {unit_type}: {beds_n} bed, {fmt_num(r.get('bathrooms'))} bath. "
            f"Price: ${price_per_bed}/bed per month, ${price_total}/month total. "
            f"Availability: {availability}. Area: {area}. "
            f"Company: {COMPANY}. Link: {DETAIL_URL.format(uid=r['listable_uid'])}"
        ),
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print(f"Fetching listings: {API_URL}")
    raw = fetch_all()
    print(f"Fetched {len(raw)} records")

    listings: list[dict] = []
    for r in raw:
        low, _ = rent_bounds(r)
        if low <= 0:
            # e.g. the "SUBLEASE APPLICATION!" pseudo-listing carries rent 0
            print(f"  ⏭ Skipping non-listing record: {r.get('marketing_title', '')[:60]}")
            continue
        listings.append(to_record(r))

    listings.sort(key=lambda x: (x["address"], x["unit_type"]))
    save_scrape(listings, "smile", failed=0)


if __name__ == "__main__":
    main()
