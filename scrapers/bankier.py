# scrapers/bankier.py
# Bankier Apartments — UIUC Housing Scraper
#
# Strategy:
#   The main site (bankierapartments.com, WordPress/Flywheel, permissive robots,
#   no ToS) exposes its homepage search as a public admin-ajax endpoint that
#   returns server-rendered property cards with lat/lng, photo, amenity classes,
#   and rent/beds/baths/sqft ranges. Querying once per bed count (0-4) makes the
#   ranges bed-specific → one record per property × bed count.
#
#   The 13 per-building microsites (e.g. 406bankierapartments.com) hold the
#   finer data (floorplan names, exact dates) but sit behind a Cloudflare
#   managed challenge — active bot-detection that this project does NOT bypass.
#   This scraper never requests them; the `url` field just links users there.
#
#   Pricing is whole-unit (joint leases): price_total = listed range,
#   price_per_bed = total ÷ beds. NOTE: the widget's rent numbers proved stale
#   vs the microsites' real rates (2026-07: $720/bed shown vs $900/bed real),
#   so pipeline/normalize.py (MANUAL_PRICE_NOTES) drops them before publication
#   and every surface shows "manual price search required" instead. They are
#   still scraped here so the raw archive stays a faithful record, and because
#   "Pricing unavailable" rows are treated as Leased (Bankier hides pricing for
#   configs they can't currently lease) — that inference is unaffected.
#   Coordinates come from the cards, so pipeline/geocode.py skips Bankier.
#   See design-docs/ai-pipeline-implementation-phases/phase-9.4-bankier-scraper.md
#
# Run:    python scrapers/bankier.py
# Output: data/bankier_raw.json                                (canonical latest, read by normalize)
#         data/raw_archive/bankier_raw_YYYY-MM-DD_HHMMSS.json  (timestamped archive, every run)
# Save/archive logic lives in scrapers/_archive.py

import re
import time

import requests
from bs4 import BeautifulSoup

from _archive import save_scrape

AJAX_URL    = "https://bankierapartments.com/wp-admin/admin-ajax.php"
COMPANY     = "Bankier Apartments"
BED_COUNTS  = [0, 1, 2, 3, 4]   # the search form's full range of beds checkboxes
POLITE_DELAY = 2  # seconds between requests (no robots crawl-delay; just courtesy)

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


def search(beds: int) -> str:
    """One propertysearch POST filtered to a bed count; returns the cards HTML."""
    resp = requests.post(
        AJAX_URL,
        data={
            "action":     "propertysearch",
            f"beds-{beds}": "on",
            "pricesmall": "0",
            "pricebig":   "8000",
        },
        headers={"User-Agent": USER_AGENT},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.text


def parse_price(rentrange: str) -> tuple[int | None, int | None]:
    """'$3100' → (3100, 3100); '$900-1120' → (900, 1120); 'Pricing unavailable' → (None, None)."""
    nums = [int(n) for n in re.findall(r"\d+", rentrange.replace(",", ""))]
    if not nums:
        return None, None
    return nums[0], nums[-1]


def amenities_from_classes(classes: list[str]) -> str:
    """['amenities-air-conditioning', ...] → 'Air Conditioning, ...'"""
    names = []
    for c in classes:
        if c.startswith("amenities-"):
            names.append(c.removeprefix("amenities-").replace("-", " ").title())
    return ", ".join(names)


def parse_cards(html_text: str, beds: int) -> list[dict]:
    soup = BeautifulSoup(html_text, "html.parser")
    records = []
    for card in soup.select("div[data-id][data-url]"):
        info = card.select_one(".property-info")
        if not info:
            continue
        name    = info.h3.get_text(strip=True) if info.h3 else ""
        street  = card.select_one(".the-address .address")
        city    = card.select_one(".the-address .city")
        address = f"{street.get_text(strip=True) if street else name}, " \
                  f"{city.get_text(strip=True) if city else 'Champaign'}"

        rent_el   = card.select_one(".rentrange")
        rentrange = rent_el.get_text(strip=True) if rent_el else ""
        low, high = parse_price(rentrange)

        baths_el = card.select_one(".bathsrange")
        baths_m  = re.search(r"[\d.]+", baths_el.get_text(strip=True)) if baths_el else None
        baths    = baths_m.group(0) if baths_m else ""

        sqft_el = card.select_one(".sqftrange")
        sqft_n  = 0
        if sqft_el:
            nums = [int(n) for n in re.findall(r"\d+", sqft_el.get_text(strip=True))]
            sqft_n = max(nums) if nums else 0

        classes   = card.get("class") or []
        immediate = "propertytypes-immediate" in classes

        if low is None:
            # "Pricing unavailable" — config can't currently be leased (see doc)
            availability = "Leased"
            price_total = price_per_bed = ""
        else:
            # Leases run on the 2026-2027 academic year starting in August —
            # stated explicitly for the August 2026 availability window.
            availability = ("Available August 2026, Immediate Move-In options in building"
                            if immediate else "Available August 2026")
            price_total   = str(low) if low == high else f"{low}-{high}"
            divisor       = max(beds, 1)
            pb_low, pb_high = round(low / divisor), round(high / divisor)
            price_per_bed = str(pb_low) if pb_low == pb_high else f"{pb_low}-{pb_high}"

        unit_type = "Studio" if beds == 0 else f"{beds} Bedroom"
        url       = card.get("data-url") or ""
        img_wrap  = card.select_one("[data-image-url]")

        records.append({
            "company":              COMPANY,
            "address":              address,
            "area":                 "",
            "property_type":        "Apartment",
            "roommate_match":       False,   # whole-unit joint leases
            "unit_type":            unit_type,
            "beds":                 str(beds),
            "baths":                baths,
            "sqft":                 str(sqft_n) if sqft_n > 0 else "",
            "price_total":          price_total,
            "price_per_bed":        price_per_bed,
            "availability":         availability,
            "url":                  url,
            "photo_url":            (img_wrap.get("data-image-url") if img_wrap else "") or "",
            "availability_summary": availability,
            "tagline":              "",
            "description":          "",
            "amenities":            amenities_from_classes(classes),
            "lat":                  float(card["data-latitude"])  if card.get("data-latitude")  else None,
            "lng":                  float(card["data-longitude"]) if card.get("data-longitude") else None,
            "text": (
                f"{address}. {unit_type}: {beds} bed"
                + (f", {baths} bath" if baths else "") + ". "
                + (f"Price: ${price_per_bed}/bed per month, ${price_total}/month total. "
                   if price_total else "")
                + f"Availability: {availability}. Company: {COMPANY}. Link: {url}"
            ),
        })
    return records


def main():
    print(f"Querying property search: {AJAX_URL}")
    listings: list[dict] = []
    for i, beds in enumerate(BED_COUNTS):
        html_text = search(beds)
        rows = parse_cards(html_text, beds)
        print(f"  beds={beds}: {len(rows)} properties")
        listings.extend(rows)
        if i < len(BED_COUNTS) - 1:
            time.sleep(POLITE_DELAY)

    listings.sort(key=lambda x: (x["address"], x["unit_type"]))
    save_scrape(listings, "bankier", failed=0)


if __name__ == "__main__":
    main()
