# scrapers/octave.py
# Octave (210 S Fourth St, Champaign) — UIUC Housing Scraper
#
# Strategy:
#   Single Asset Living student high-rise. WordPress/Elementor site whose
#   /floor-plans/ page server-renders all 11 floorplans as jet-portfolio
#   cards: title (A1…D4), "N Bed / N Bath", sqft, per-bed price (old price
#   struck through when discounted), and a floorplan-status span with
#   "Sold Out" or "N spaces remaining". One requests call, no Playwright.
#
#   Pricing is per bed ("spaces remaining" = individual beds; roommate
#   matching offered): price_total = per-bed × beds.
#
#   Failure model: all-or-nothing. A failed request exits nonzero and writes
#   nothing. See design-docs/.../phase-9.7-octave-scraper.md
#
# Run:    python scrapers/octave.py
# Output: data/octave_raw.json                                (canonical latest, read by normalize)
#         data/raw_archive/octave_raw_YYYY-MM-DD_HHMMSS.json  (timestamped archive, every run)
# Save/archive logic lives in scrapers/_archive.py

import re

import requests
from bs4 import BeautifulSoup

from _archive import save_scrape

FLOOR_PLANS_URL = "https://liveatoctave.com/floor-plans/"
COMPANY         = "Octave"
ADDRESS         = "210 S Fourth Street, Champaign"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


def fetch() -> str:
    resp = requests.get(FLOOR_PLANS_URL, headers={"User-Agent": USER_AGENT}, timeout=30)
    resp.raise_for_status()
    return resp.text


def parse_cards(html_text: str) -> list[dict]:
    soup = BeautifulSoup(html_text, "html.parser")
    records = []
    for card in soup.select("article.jet-portfolio__item"):
        title_el = card.select_one(".jet-portfolio__title")
        desc_el  = card.select_one(".jet-portfolio__desc")
        if not title_el or not desc_el:
            continue
        name = title_el.get_text(strip=True)

        # Struck-through prices are outdated — drop them before reading the rest
        for s in desc_el.find_all("s"):
            s.decompose()
        desc = desc_el.get_text(" ", strip=True)

        m = re.search(r"(\d+)\s*Bed\s*/\s*([\d.]+)\s*Bath", desc, re.I)
        beds_n = int(m.group(1)) if m else 0
        baths  = m.group(2) if m else ""

        m = re.search(r"([\d,]+)\s*SQ\s*FT", desc, re.I)
        sqft = m.group(1).replace(",", "") if m else ""

        m = re.search(r"\$([\d,]+)", desc)
        per_bed = int(m.group(1).replace(",", "")) if m else 0

        status = card.select_one(".floorplan-status")
        status_txt = status.get_text(strip=True) if status else ""
        # Octave leases run on the academic year starting in August — stated
        # explicitly so the August 2026 availability window picks these up.
        m = re.search(r"(\d+)\s*spaces?\s*remaining", status_txt, re.I)
        if m:
            availability = f"Available August 2026 ({m.group(1)} spaces left)"
        elif re.search(r"sold\s*out", desc + status_txt, re.I):
            availability = "Leased"
        else:
            availability = "Leased" if per_bed == 0 else "Available August 2026"

        total = per_bed * max(beds_n, 1) if per_bed else 0

        img = card.select_one("img.jet-portfolio__image-instance")

        records.append({
            "company":              COMPANY,
            "address":              ADDRESS,
            "area":                 "",
            "property_type":        "Apartment",
            # by-the-space leases with roommate matching — see design doc
            "roommate_match":       beds_n >= 2,
            "unit_type":            f"{name} - " + ("Studio" if beds_n == 0 else f"{beds_n} Bed/{baths} Bath"),
            "beds":                 str(beds_n),
            "baths":                baths,
            "sqft":                 sqft,
            "price_total":          str(total) if total else "",
            "price_per_bed":        str(per_bed) if per_bed else "",
            "availability":         availability,
            "url":                  FLOOR_PLANS_URL,
            "photo_url":            img["src"] if img and img.get("src") else "",
            "availability_summary": availability,
            "tagline":              "",
            "description":          "",
            "amenities":            "",
            "text": (
                f"{ADDRESS}. {name}: {beds_n} bed, {baths} bath"
                + (f", {sqft} sqft" if sqft else "") + ". "
                + (f"Price: ${per_bed}/bed per month, ${total}/month total. " if per_bed else "")
                + f"Availability: {availability}. Company: {COMPANY}. Link: {FLOOR_PLANS_URL}"
            ),
        })
    return records


def main():
    print(f"Fetching floor plans: {FLOOR_PLANS_URL}")
    listings = parse_cards(fetch())
    print(f"Parsed {len(listings)} floor plans")
    listings.sort(key=lambda x: (x["address"], x["unit_type"]))
    save_scrape(listings, "octave", failed=0)


if __name__ == "__main__":
    main()
