# scrapers/mhm.py
# MHM Properties — UIUC Housing Scraper
#
# Strategy:
#   Plain WordPress site, no bot protection. The full portfolio is 18 property
#   pages on a custom `property` post type, enumerated by property-sitemap.xml
#   (authoritative here — the Apartments / Houses & Condos nav pages link the
#   same set). Each page is server-rendered HTML with id-tagged sections:
#   #overview (tagline + description), #price .pricebox (one row per unit type),
#   #amenities, #photos. Requests + BeautifulSoup only; no Playwright.
#
#   Pricebox rows come in two flavors:
#     - Apartments: label is a unit type ("3 Bed/1 Bath - Jacuzzi") → parse beds/baths
#     - Houses:     label is a lease year ("2026-2027:") → unit_type "House",
#                   year kept in lease_dates, beds/baths left empty (never guessed)
#   The <span> in each row holds either "$625/person (LAST UNIT)" or "LEASED!".
#   Prices are per person assuming full occupancy (stated on every page), so
#   price_total = price × beds when beds are known, empty otherwise.
#
#   robots.txt allows all agents with Crawl-delay: 10, honored between pages.
#   A page that fails to fetch is left out of this run's output (honest gap,
#   never backfilled); the run is archived as _partial and a re-run fixes it.
#   See design-docs/ai-pipeline-implementation-phases/phase-9.2-mhm-scraper.md
#
# Run:    python scrapers/mhm.py
# Output: data/mhm_raw.json                                (canonical latest, read by normalize)
#         data/raw_archive/mhm_raw_YYYY-MM-DD_HHMMSS.json  (timestamped archive, every run)
# Save/archive logic lives in scrapers/_archive.py

import re
import time

import requests
from bs4 import BeautifulSoup

from _archive import save_scrape

SITEMAP_URL = "https://www.mhmproperties.com/property-sitemap.xml"
CRAWL_DELAY = 10  # seconds, per robots.txt Crawl-delay
COMPANY     = "MHM Properties"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

# "2026-2027" or "2026-2027:" — a house lease-year row rather than a unit type
YEAR_LABEL_RE = re.compile(r"^\s*(\d{4})\s*[-–]\s*(\d{4})\s*:?\s*$")


def fetch(url: str) -> str:
    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
    resp.raise_for_status()
    return resp.text


def property_urls() -> list[str]:
    """All property page URLs from the sitemap, minus the /property/ archive root."""
    xml = fetch(SITEMAP_URL)
    urls = re.findall(r"<loc>(https://www\.mhmproperties\.com/property/[^<]+)</loc>", xml)
    return [u for u in urls if u.rstrip("/") != "https://www.mhmproperties.com/property"]


def parse_beds_baths(label: str) -> tuple[str, str]:
    """'3 Bed/1 Bath - Jacuzzi' → ('3', '1'). 'Studio' → ('0', ''). Unparseable → ('', '')."""
    if re.search(r"\bstudio\b", label, re.IGNORECASE):
        return "0", ""
    beds  = ""
    baths = ""
    m = re.search(r"(\d+)\s*Bed", label, re.IGNORECASE)
    if m:
        beds = m.group(1)
    m = re.search(r"(\d+(?:\.\d+)?)\s*Bath", label, re.IGNORECASE)
    if m:
        baths = m.group(1)
    return beds, baths


def parse_price_span(span_text: str) -> tuple[str, str]:
    """
    '$625/person (LAST UNIT)' → ('625', 'Available August 2026 (LAST UNIT)')
    'LEASED!'                 → ('',    'Leased')

    Priced rows are for the 2026-2027 lease year (the page's Price Per Person
    section), which starts in August — stated explicitly so the August 2026
    availability window picks these up.
    """
    t = span_text.strip()
    if re.search(r"leased", t, re.IGNORECASE):
        return "", "Leased"
    m = re.search(r"\$\s*([\d,]+)", t)
    if not m:
        return "", t  # unexpected format — keep the raw text as availability
    price = m.group(1).replace(",", "")
    note  = ""
    n = re.search(r"\(([^)]+)\)", t)
    if n:
        note = f" ({n.group(1)})"
    return price, f"Available August 2026{note}"


def parse_property(url: str, html_text: str) -> list[dict]:
    soup = BeautifulSoup(html_text, "html.parser")

    h1      = soup.find("h1")
    street  = h1.get_text(strip=True) if h1 else ""
    address = f"{street}, Champaign"  # all MHM properties are in Champaign

    tagline     = ""
    description = ""
    overview = soup.find(id="overview")
    if overview:
        h2 = overview.find("h2")
        if h2:
            tagline = h2.get_text(strip=True)
        paragraphs  = [p.get_text(" ", strip=True) for p in overview.find_all("p")]
        description = re.sub(r"\s+", " ", " ".join(paragraphs)).strip()

    amenities = ""
    amen = soup.find(id="amenities")
    if amen:
        amenities = ", ".join(li.get_text(strip=True) for li in amen.find_all("li"))

    photo_url = ""
    photos = soup.find(id="photos")
    if photos:
        img = photos.find("img")
        if img:
            photo_url = img.get("src") or ""

    listings: list[dict] = []
    price_div = soup.find(id="price")
    for box in (price_div.find_all("div", class_="pricebox") if price_div else []):
        span = box.find("span")
        if not span:
            continue
        price, availability = parse_price_span(span.get_text(strip=True))
        label = box.get_text(strip=True)
        label = label.replace(span.get_text(strip=True), "", 1)
        label = re.sub(r"View Typical Unit.*$", "", label).strip(" : ")

        year_match = YEAR_LABEL_RE.match(label)
        if year_match:
            unit_type   = "House"
            beds, baths = "", ""
            lease_dates = f"{year_match.group(1)}-{year_match.group(2)}"
        else:
            unit_type   = label
            beds, baths = parse_beds_baths(label)
            lease_dates = ""

        # Prices are per person assuming full occupancy (stated on every page)
        price_per_bed = price
        price_total   = str(int(price) * int(beds)) if price and beds and int(beds) > 0 else \
                        (price if beds in ("0", "1") else "")

        listings.append({
            "company":              COMPANY,
            "address":              address,
            "area":                 "",
            "property_type":        "Apartment",  # normalize maps "House" unit_type → House
            # e.g. "$915/person (Roommate Matching- FEMALE ONLY)"
            "roommate_match":       "roommate matching" in availability.lower(),
            "unit_type":            unit_type,
            "beds":                 beds,
            "baths":                baths,
            "sqft":                 "",
            "price_total":          price_total,
            "price_per_bed":        price_per_bed,
            "availability":         availability,
            "url":                  url,
            "photo_url":            photo_url,
            "availability_summary": availability,
            "tagline":              tagline,
            "description":          description,
            "amenities":            amenities,
            "lease_dates":          lease_dates,
            "text": (
                f"{address}. {unit_type}"
                + (f": {beds} bed" if beds else "")
                + (f", {baths} bath" if baths else "")
                + ". "
                + (f"Price: ${price_per_bed}/person per month. " if price_per_bed else "")
                + f"Availability: {availability}. Company: {COMPANY}. Link: {url}"
            ),
        })
    return listings


def main():
    print(f"Loading property list: {SITEMAP_URL}")
    urls = property_urls()
    print(f"Found {len(urls)} properties\n")

    listings: list[dict] = []
    failed = 0
    for i, url in enumerate(urls, 1):
        try:
            html_text = fetch(url)
        except requests.RequestException as e:
            print(f"  [{i}/{len(urls)}] ⚠ Failed to load {url}: {e}")
            failed += 1
            time.sleep(CRAWL_DELAY)
            continue

        rows = parse_property(url, html_text)
        if rows:
            print(f"  [{i}/{len(urls)}] ✓ {rows[0]['address']} — {len(rows)} unit type(s)")
            listings.extend(rows)
        else:
            print(f"  [{i}/{len(urls)}] ⚠ No pricebox rows parsed on {url}")
            failed += 1

        if i < len(urls):
            time.sleep(CRAWL_DELAY)

    listings.sort(key=lambda x: (x["address"], x["unit_type"]))
    save_scrape(listings, "mhm", failed=failed)


if __name__ == "__main__":
    main()
