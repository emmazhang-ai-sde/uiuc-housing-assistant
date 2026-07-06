# scrapers/roland.py
# Roland Realty — UIUC Housing Scraper
#
# Strategy:
#   Webflow site; the "All Fall '26 Listings" page server-renders ~345 unit
#   cards with machine-readable fs-cmsfilter-field attributes (address, beds,
#   baths, whole-unit rent, by-the-bed rent, availability boolean, style,
#   area) and paginates server-side via ?f5630116_page=N. Plain requests.
#
#   Pricing: fs_rent-fall is the whole-unit rent (0 = "Call for rate");
#   fs_rent-fall-btb is the per-bed rent for by-the-bed units. Whichever is
#   missing is derived from the other via the bed count.
#
#   Availability: fs-available true → "Available August 2026" (Fall '26 =
#   August move-in), false → "Leased".
#
#   Unit-suffixed addresses ("807 S Locust St-8") are split: base street goes
#   to `address` (one geocode per building), the unit number into `unit_type`
#   (keeps ingest doc IDs unique between sibling units).
#
#   Failure model: all-or-nothing. Any failed page aborts without writing.
#   See design-docs/ai-pipeline-implementation-phases/phase-9.6-roland-scraper.md
#
# Run:    python scrapers/roland.py
# Output: data/roland_raw.json                                (canonical latest, read by normalize)
#         data/raw_archive/roland_raw_YYYY-MM-DD_HHMMSS.json  (timestamped archive, every run)
# Save/archive logic lives in scrapers/_archive.py

import re
import time

import requests
from bs4 import BeautifulSoup

from _archive import save_scrape

BASE_URL     = "https://www.roland-realty.com"
LIST_URL     = f"{BASE_URL}/for-rent/available-fall/all-unit-listings"
PAGE_PARAM   = "f5630116_page"
COMPANY      = "Roland Realty"
POLITE_DELAY = 2   # seconds between page fetches (no robots crawl-delay; courtesy)
MAX_PAGES    = 30  # hard stop well above the ~10 real pages

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

# "807 S Locust St-8" → base "807 S Locust St", unit "8"
UNIT_SUFFIX_RE = re.compile(r"^(.*?[A-Za-z.])-(\d+[A-Za-z]?)$")


def fetch_page(page: int) -> str:
    resp = requests.get(
        LIST_URL,
        params={PAGE_PARAM: page} if page > 1 else None,
        headers={"User-Agent": USER_AGENT},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.text


def field(card, cls: str) -> str:
    el = card.select_one(f".{cls}")
    return el.get_text(strip=True) if el else ""


def parse_int(s: str) -> int:
    nums = re.findall(r"\d+", s.replace(",", ""))
    return int(nums[0]) if nums else 0


def parse_cards(html_text: str) -> list[dict]:
    soup = BeautifulSoup(html_text, "html.parser")
    records = []
    for card in soup.select("div.collection-item-unit-listing"):
        link = card.select_one("a[href^='/unit-listings/']")
        if not link:
            continue
        url = BASE_URL + link["href"]

        name = field(card, "fs-address") or field(card, "fs-name")
        m = UNIT_SUFFIX_RE.match(name)
        if m:
            street, unit_no = m.group(1).strip(), m.group(2)
        else:
            street, unit_no = name.strip(), ""
        address = f"{street}, Champaign"  # cards carry no city; Roland is Champaign campus

        # Beds/baths from the visible summary line ("14 Bedrooms 7 Bathrooms" / studio)
        beds_txt  = field(card, "bedrooms-db-label")
        is_studio = bool(card.select_one(".studio-db-label")) and not beds_txt
        beds_n    = 0 if is_studio else parse_int(beds_txt)
        baths     = field(card, "bathrooms-db-label")

        total   = parse_int(field(card, "fs_rent-fall"))
        per_bed = parse_int(field(card, "fs_rent-fall-btb"))
        if total == 0 and per_bed > 0:
            total = per_bed * max(beds_n, 1)
        if per_bed == 0 and total > 0:
            per_bed = round(total / max(beds_n, 1))

        available = field(card, "fs-available").strip().lower() == "true"
        availability = "Available August 2026" if available else "Leased"

        # "By-the-bed!" badge: visible (no w-condition-invisible) ⇒ per-bed leases
        by_the_bed = any(
            "w-condition-invisible" not in (b.get("class") or [])
            for b in card.select(".listing-badge-unit-listings-v2")
            if "by-the-bed" in b.get_text(strip=True).lower()
        )

        style = field(card, "fs-style") or "Apartment"
        area  = field(card, "fs-area")

        # No unit-number suffix here: sibling units of the same floor plan are
        # aggregated into one record with a price range (see aggregate()), the
        # same floorplan-level model the GSR scraper uses.
        unit_type = "Studio" if beds_n == 0 else f"{beds_n} Bedroom"
        if style.lower() == "house":
            unit_type = f"{unit_type} House" if beds_n else "House"

        img = card.select_one("img[src]")

        records.append({
            "company":              COMPANY,
            "address":              address,
            "area":                 area,
            "property_type":        style,
            "roommate_match":       by_the_bed,
            "unit_type":            unit_type,
            "beds":                 str(beds_n),
            "baths":                baths,
            "sqft":                 "",
            "price_total":          str(total) if total else "",
            "price_per_bed":        str(per_bed) if per_bed else "",
            "availability":         availability,
            "url":                  url,
            "photo_url":            img["src"] if img else "",
            "availability_summary": availability,
            "tagline":              "",
            "description":          "",
            "amenities":            "",   # rendered client-side (Finsweet nest) — not in raw HTML
            "text": (
                f"{address}. {unit_type}: {beds_n} bed"
                + (f", {baths} bath" if baths else "") + ". "
                + (f"Price: ${per_bed}/bed per month, ${total}/month total. " if total else "")
                + f"Availability: {availability}. Company: {COMPANY}. Link: {url}"
            ),
        })
    return records


def price_range(values: list[int]) -> str:
    values = sorted(v for v in values if v)
    if not values:
        return ""
    return str(values[0]) if values[0] == values[-1] else f"{values[0]}-{values[-1]}"


def aggregate(units: list[dict]) -> list[dict]:
    """Collapse per-unit cards into one record per (address, unit_type) with
    price ranges — matches the floorplan-level model of the other scrapers and
    keeps ingest doc IDs (md5 of address|unit_type) unique. A big building can
    list 40 identical-type units; one record with '1200-1400' says it all."""
    groups: dict[tuple, list[dict]] = {}
    for u in units:
        groups.setdefault((u["address"], u["unit_type"]), []).append(u)

    merged = []
    for rows in groups.values():
        # Prefer an available unit as the representative (its url/photo/text)
        rep = next((r for r in rows if r["availability"] != "Leased"), rows[0])
        rec = dict(rep)
        rec["price_total"]   = price_range([int(r["price_total"])   for r in rows if r["price_total"]])
        rec["price_per_bed"] = price_range([int(r["price_per_bed"]) for r in rows if r["price_per_bed"]])
        rec["roommate_match"] = any(r["roommate_match"] for r in rows)
        n_avail = sum(1 for r in rows if r["availability"] != "Leased")
        if n_avail and len(rows) > 1:
            rec["availability"] = f"Available August 2026 ({n_avail} of {len(rows)} units)"
            rec["availability_summary"] = rec["availability"]
        rec["text"] = (
            f"{rec['address']}. {rec['unit_type']}: {rec['beds']} bed"
            + (f", {rec['baths']} bath" if rec["baths"] else "") + ". "
            + (f"Price: ${rec['price_per_bed']}/bed per month, ${rec['price_total']}/month total. "
               if rec["price_total"] else "")
            + f"Availability: {rec['availability']}. Company: {COMPANY}. Link: {rec['url']}"
        )
        merged.append(rec)
    return merged


def main():
    print(f"Loading unit listings: {LIST_URL}")
    listings: list[dict] = []
    seen: set[str] = set()
    for page in range(1, MAX_PAGES + 1):
        rows = parse_cards(fetch_page(page))
        new = [r for r in rows if r["url"] not in seen]
        print(f"  page {page}: {len(rows)} cards, {len(new)} new")
        if not new:
            break
        seen.update(r["url"] for r in new)
        listings.extend(new)
        time.sleep(POLITE_DELAY)

    merged = aggregate(listings)
    print(f"Aggregated {len(listings)} unit cards into {len(merged)} floorplan records")
    merged.sort(key=lambda x: (x["address"], x["unit_type"]))
    save_scrape(merged, "roland", failed=0)


if __name__ == "__main__":
    main()
