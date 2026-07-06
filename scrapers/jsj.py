# scrapers/jsj.py
# JSJ Property Management — UIUC Housing Scraper
#
# Strategy:
#   Same architecture as scrapers/smile.py: jsjmanagement.com is a Duda site
#   whose availability pages render an AppFolio widget backed by a public Duda
#   Collections JSON endpoint (SiteAlias 42273af2, AppFolio db "jsjproperty").
#   No cookies, no JS, no bot protection — plain requests, paged by 100.
#
#   Differences from Smile:
#     - Rents are WHOLE-UNIT (by_the_bed false everywhere, rents rise with
#       bedroom count): price_total = rent, price_per_bed = rent / beds.
#     - JSJ manages properties outside Champaign-Urbana (Charleston/EIU,
#       Rantoul, Mahomet...). Only Champaign / Urbana / Savoy are kept.
#
#   Failure model: all-or-nothing. A failed request exits nonzero and writes
#   nothing, so the output can never mix fresh and stale data.
#   See design-docs/ai-pipeline-implementation-phases/phase-9.5-jsj-scraper.md
#
# Run:    python scrapers/jsj.py
# Output: data/jsj_raw.json                                (canonical latest, read by normalize)
#         data/raw_archive/jsj_raw_YYYY-MM-DD_HHMMSS.json  (timestamped archive, every run)
# Save/archive logic lives in scrapers/_archive.py

import html
import re
from datetime import date, datetime

import requests

from _archive import save_scrape

API_URL = (
    "https://www.jsjmanagement.com/rts/collections/public/42273af2/"
    "runtime/collection/appfolio-listings/query-data"
)
PAGE_SIZE  = 100
COMPANY    = "JSJ Property Management"
DETAIL_URL = "https://jsjproperty.appfolio.com/listings/detail/{uid}"
KEEP_CITIES = {"champaign", "urbana", "savoy"}

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


# ── Fetch ─────────────────────────────────────────────────────────────────────

def fetch_all() -> list[dict]:
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
    if not s:
        return ""
    s = re.sub(r"<br\s*/?>", " ", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def fmt_num(x) -> str:
    if x in (None, ""):
        return ""
    f = float(x)
    return str(int(f)) if f == int(f) else str(f)


def availability_strings(avail_date: str | None) -> tuple[str, str]:
    if not avail_date:
        return "", ""
    d = datetime.strptime(avail_date, "%Y-%m-%d").date()
    if d <= date.today():
        return "Available now", "Available now"
    return f"Available {d.strftime('%B')} {d.day}, {d.year}", f"Available {d.strftime('%B %Y')}"


# ── Record mapping ────────────────────────────────────────────────────────────

def to_record(r: dict) -> dict:
    beds_n = int(r.get("bedrooms") or 0)
    rent   = int(float(r.get("market_rent") or 0))

    # Whole-unit rents (see module docstring): total is listed, per-bed derived
    price_total   = str(rent)
    price_per_bed = str(round(rent / beds_n)) if beds_n >= 2 else str(rent)

    title = clean_text(r.get("marketing_title"))
    desc  = clean_text(r.get("marketing_description"))

    unit_type = clean_text(r.get("unit_template_name"))
    if not unit_type or "obsolete" in unit_type.lower():
        unit_type = "Studio" if beds_n == 0 else f"{beds_n} Bedroom"

    address = f"{r.get('address_address1', '').strip()}, {r.get('address_city', '').strip()}"
    availability, availability_summary = availability_strings(r.get("available_date"))

    photos    = r.get("photos") or []
    photo_url = r.get("default_photo_thumbnail_url") or (photos[0]["url"] if photos else "")

    return {
        "company":              COMPANY,
        "address":              address,
        "area":                 "",
        "property_type":        "Apartment",
        "roommate_match":       False,   # whole-unit joint leases
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
            f"Availability: {availability}. "
            f"Company: {COMPANY}. Link: {DETAIL_URL.format(uid=r['listable_uid'])}"
        ),
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def price_range(values: list[int]) -> str:
    values = sorted(v for v in values if v)
    if not values:
        return ""
    return str(values[0]) if values[0] == values[-1] else f"{values[0]}-{values[-1]}"


def aggregate(units: list[dict]) -> list[dict]:
    """One record per (address, unit_type) with price ranges — several AppFolio
    listings are sibling units of the same floor plan, and ingest doc IDs
    (md5 of address|unit_type) must stay unique."""
    groups: dict[tuple, list[dict]] = {}
    for u in units:
        groups.setdefault((u["address"], u["unit_type"]), []).append(u)

    merged = []
    for rows in groups.values():
        # "Available now" beats dated availability as the representative
        rep = next((r for r in rows if r["availability"] == "Available now"), rows[0])
        rec = dict(rep)
        rec["price_total"]   = price_range([int(r["price_total"])   for r in rows if r["price_total"]])
        rec["price_per_bed"] = price_range([int(r["price_per_bed"]) for r in rows if r["price_per_bed"]])
        if len(rows) > 1:
            rec["text"] = rec["text"].replace(
                f"Price: ${rep['price_per_bed']}/bed per month, ${rep['price_total']}/month total.",
                f"Price: ${rec['price_per_bed']}/bed per month, ${rec['price_total']}/month total"
                f" ({len(rows)} units).",
            )
        merged.append(rec)
    return merged


def main():
    print(f"Fetching listings: {API_URL}")
    raw = fetch_all()
    print(f"Fetched {len(raw)} records")

    listings: list[dict] = []
    skipped_area = 0
    for r in raw:
        rent = float(r.get("market_rent") or 0)
        if rent <= 0:
            print(f"  ⏭ Skipping non-listing record: {(r.get('marketing_title') or '')[:60]}")
            continue
        city = (r.get("address_city") or "").strip().lower()
        if city not in KEEP_CITIES:
            skipped_area += 1
            continue
        listings.append(to_record(r))

    if skipped_area:
        print(f"  ⏭ Skipped {skipped_area} listings outside Champaign-Urbana-Savoy")

    merged = aggregate(listings)
    print(f"Aggregated {len(listings)} unit listings into {len(merged)} floorplan records")
    merged.sort(key=lambda x: (x["address"], x["unit_type"]))
    save_scrape(merged, "jsj", failed=0)


if __name__ == "__main__":
    main()
