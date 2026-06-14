# scrapers/universities_group.py
# Universities Group — UIUC Housing Scraper
#
# Strategy:
#   1. Fetch all property URLs from the XML sitemap
#   2. Visit each property detail page via Playwright (site is behind Incapsula CDN
#      and requires JS rendering — plain requests are blocked)
#   3. Each unit type lives in a div.tab-content_in_wrapp:
#        - Name:  h4.propert_head  e.g. "Luxury 1 Bedroom"
#        - Data:  div.tab-content_in_rgt > ul > li  (label / value pairs)
#        - Beds:  parsed from unit type name via regex
#
# Run:    python scrapers/universities_group.py
# Output: data/universities_group_raw.json

import re
import time
import json
import xml.etree.ElementTree as ET
import requests
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright, Page

SITEMAP_URL = "https://ugroupcu.com/property_details-sitemap.xml"
CRAWL_DELAY = 2  # seconds between page requests

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
}


def get_property_urls() -> list[str]:
    res = requests.get(SITEMAP_URL, headers=HEADERS)
    root = ET.fromstring(res.text)
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    return [loc.text.strip() for loc in root.findall(".//sm:loc", ns)]


def parse_beds(unit_type: str) -> int:
    if "studio" in unit_type.lower():
        return 0
    match = re.search(r"(\d+)\s+bedroom", unit_type, re.IGNORECASE)
    return int(match.group(1)) if match else 0


def parse_price(raw: str) -> str:
    cleaned = re.sub(r"[,$]", "", raw.strip())
    try:
        value = int(float(cleaned))
        return str(value) if value > 0 else ""
    except ValueError:
        return ""


def fetch_html(page: Page, url: str) -> str | None:
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=25000)
        time.sleep(3)
        return page.content()
    except Exception as e:
        print(f"  ⚠ Failed to load {url}: {e}")
        return None


def parse_property(html: str, url: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")

    h3 = soup.find("h3")
    address = h3.get_text(strip=True) if h3 else ""

    listings = []

    for unit in soup.find_all("div", class_="tab-content_in_wrapp"):
        h4 = unit.find("h4", class_="propert_head")
        unit_type = h4.get_text(strip=True) if h4 else ""

        fields: dict[str, str] = {}
        rgt = unit.find("div", class_="tab-content_in_rgt")
        if rgt:
            for li in rgt.find_all("li"):
                divs = li.find_all("div")
                if len(divs) >= 2:
                    label = divs[0].get_text(strip=True).rstrip(":")
                    value = divs[1].get_text(strip=True)
                    fields[label] = value

        price_total   = parse_price(fields.get("Price per month", ""))
        price_per_bed = parse_price(fields.get("Price per occupant", ""))
        availability  = fields.get("Availability", "").strip()
        baths         = fields.get("Bathrooms", "").strip()
        beds          = parse_beds(unit_type)

        if not price_total and not price_per_bed:
            availability = "Leased"

        listings.append({
            "company":        "Universities Group",
            "address":        address,
            "area":           "",
            "property_type":  "Apartment",
            "roommate_match": False,
            "unit_type":      unit_type,
            "beds":           str(beds),
            "baths":          baths,
            "sqft":           "",
            "price_total":    price_total,
            "price_per_bed":  price_per_bed,
            "availability":   availability,
            "url":            url,
            "text": (
                f"{address}, Champaign IL. "
                f"{unit_type}: {beds} bed, {baths} bath. "
                f"Price: ${price_per_bed}/bed per month, ${price_total}/month total. "
                f"Availability: {availability}. "
                f"Company: Universities Group. "
                f"Link: {url}"
            )
        })

    return listings


def scrape_universities_group() -> list[dict]:
    print("Fetching property URLs from sitemap...")
    urls = get_property_urls()
    print(f"Found {len(urls)} properties\n")

    all_listings = []

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox"],
        )
        ctx = browser.new_context(
            user_agent=HEADERS["User-Agent"],
            viewport={"width": 1280, "height": 800},
            locale="en-US",
            timezone_id="America/Chicago",
        )
        page = ctx.new_page()
        page.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )

        # Warm up session with homepage so Incapsula sets cookies
        print("Warming up session...")
        page.goto("https://ugroupcu.com/", wait_until="domcontentloaded", timeout=20000)
        time.sleep(2)

        for i, url in enumerate(urls, 1):
            print(f"  [{i}/{len(urls)}] {url}")
            html = fetch_html(page, url)
            if html is None:
                continue
            listings = parse_property(html, url)
            print(f"         → {len(listings)} unit type(s)")
            all_listings.extend(listings)
            time.sleep(CRAWL_DELAY)

        browser.close()

    return all_listings


if __name__ == "__main__":
    data = scrape_universities_group()

    with open("data/universities_group_raw.json", "w") as f:
        json.dump(data, f, indent=2)

    unique_props = len(set(d["address"] for d in data))
    print(f"\n✅ Saved {len(data)} floor plan listings from {unique_props} properties")
    print(f"   → data/universities_group_raw.json")
