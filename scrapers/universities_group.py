# scrapers/universities_group.py
# Universities Group — UIUC Housing Scraper
#
# Strategy:
#   1. Scrape /building-list/ to build a per-property index:
#      {url → photo_url, availability_summary, tagline, area}
#   2. Use those same URLs (not the sitemap) as the scraping list — building-list
#      is the authoritative set of active properties. Sitemap contains junk
#      (test pages, expired offer pages, leased-out properties) that we skip.
#   3. Visit each detail page; parse unit-type tabs for pricing/availability.
#   4. Merge photo/area data from the building-list index into each record.
#   5. On timeout, restart the browser context (re-warm Incapsula session) to
#      avoid the "interrupted by another navigation" cascade failure.
#
# Run:    python scrapers/universities_group.py
# Output: data/universities_group_raw.json

import re
import time
import json
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright, Browser, Page

BUILDING_LIST_URL = "https://ugroupcu.com/building-list/"
CRAWL_DELAY       = 5   # seconds between detail-page requests (2s triggered Incapsula)
MAX_CONSECUTIVE_FAILURES = 3   # restart browser context after this many timeouts in a row

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


# ── URL helpers ───────────────────────────────────────────────────────────────

def norm_url(url: str) -> str:
    """Strip trailing slash for consistent lookup keys."""
    return url.rstrip("/")


# ── Browser / context helpers ─────────────────────────────────────────────────

def new_page(browser: Browser) -> Page:
    """Create a fresh context + page with stealth settings and Incapsula warm-up."""
    ctx = browser.new_context(
        user_agent=USER_AGENT,
        viewport={"width": 1280, "height": 800},
        locale="en-US",
        timezone_id="America/Chicago",
    )
    page = ctx.new_page()
    page.add_init_script(
        "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
    )
    page.goto("https://ugroupcu.com/", wait_until="domcontentloaded", timeout=20000)
    time.sleep(2)
    return page


# ── Building-list index ───────────────────────────────────────────────────────

def scrape_building_index(page: Page) -> dict[str, dict]:
    """
    Fetch /building-list/ and return a dict keyed by normalized property URL.

    Fields captured per card:
      photo_url            — exterior thumbnail  div.featured_bx_inner > a > img
      availability_summary — div.line1_desc  e.g. "Available August 2026"
      tagline              — div.line2_desc  e.g. "LUXURY 1 BR!  HUGE!"
      area                 — p.proerpty_option after stripping "Area: " prefix
    """
    print(f"Loading building list: {BUILDING_LIST_URL}")
    page.goto(BUILDING_LIST_URL, wait_until="networkidle", timeout=30000)
    time.sleep(3)

    soup  = BeautifulSoup(page.content(), "html.parser")
    index: dict[str, dict] = {}

    for card in soup.find_all("div", class_="property-list"):
        inner = card.find("div", class_="featured_bx_inner")
        if not inner:
            continue
        link = inner.find("a", href=True)
        if not link:
            continue
        url = norm_url(link["href"])

        img       = inner.find("img")
        photo_url = (img.get("src") or img.get("data-src") or "") if img else ""

        availability_summary = ""
        line1 = inner.find("div", class_="line1_desc")
        if line1:
            availability_summary = line1.get_text(strip=True)

        tagline = ""
        line2   = inner.find("div", class_="line2_desc")
        if line2:
            tagline = line2.get_text(strip=True)

        area   = ""
        area_p = card.find("p", class_="proerpty_option")
        if area_p:
            raw  = area_p.get_text(separator=" ", strip=True)
            area = re.sub(r"^Area:\s*", "", raw).strip()

        index[url] = {
            "photo_url":            photo_url,
            "availability_summary": availability_summary,
            "tagline":              tagline,
            "area":                 area,
        }

    print(f"  → {len(index)} properties indexed from building list")
    return index


# ── Detail-page parsers ───────────────────────────────────────────────────────

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


def parse_property(html: str, url: str, info: dict) -> list[dict]:
    soup    = BeautifulSoup(html, "html.parser")
    h3      = soup.find("h3")
    address = h3.get_text(strip=True) if h3 else ""

    photo_url            = info.get("photo_url", "")
    availability_summary = info.get("availability_summary", "")
    tagline              = info.get("tagline", "")
    area                 = info.get("area", "")

    listings = []

    for unit in soup.find_all("div", class_="tab-content_in_wrapp"):
        h4        = unit.find("h4", class_="propert_head")
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
            "company":              "Universities Group",
            "address":              address,
            "area":                 area,
            "property_type":        "Apartment",
            "roommate_match":       False,
            "unit_type":            unit_type,
            "beds":                 str(beds),
            "baths":                baths,
            "sqft":                 "",
            "price_total":          price_total,
            "price_per_bed":        price_per_bed,
            "availability":         availability,
            "url":                  url,
            "photo_url":            photo_url,
            "availability_summary": availability_summary,
            "tagline":              tagline,
            "text": (
                f"{address}, Champaign IL. "
                f"{unit_type}: {beds} bed, {baths} bath. "
                f"Price: ${price_per_bed}/bed per month, ${price_total}/month total. "
                f"Availability: {availability}. "
                f"Area: {area}. "
                f"Company: Universities Group. "
                f"Link: {url}"
            )
        })

    return listings


# ── Main ──────────────────────────────────────────────────────────────────────

def scrape_universities_group() -> list[dict]:
    all_listings: list[dict] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox"],
        )

        print("Warming up session...")
        page = new_page(browser)

        # Step 1: scrape building list — this gives us both the property index
        # AND the authoritative list of active URLs to scrape
        building_index = scrape_building_index(page)
        urls           = list(building_index.keys())
        total          = len(urls)
        print(f"\nScraping {total} active properties from building list\n")

        consecutive_failures = 0

        for i, url in enumerate(urls, 1):
            print(f"  [{i}/{total}] {url}")
            html = fetch_html(page, url)

            if html is None:
                consecutive_failures += 1
                if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                    print(f"  ↻ {consecutive_failures} consecutive failures — restarting browser context")
                    try:
                        page.context.close()
                    except Exception:
                        pass
                    page                 = new_page(browser)
                    consecutive_failures = 0
                continue

            consecutive_failures = 0
            listings = parse_property(html, url, building_index[url])
            print(f"         → {len(listings)} unit type(s)  📷 {building_index[url]['photo_url'][:60]}...")
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
