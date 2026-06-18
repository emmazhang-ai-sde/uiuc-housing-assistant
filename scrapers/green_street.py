# scrapers/green_street.py
# Green Street Realty — UIUC Housing Scraper
#
# Strategy:
#   Step 1 — main listing page: parse property-info-json blobs for all
#             floor-plan data + photo_url + subtitle (no extra HTTP requests)
#   Step 2 — detail pages: one visit per unique property to fetch
#             description, amenities, lease_dates, utility_fees, brochure_url
#
# robots.txt: Crawl-delay: 10 enforced between ALL requests.
#
# Run:    python scrapers/green_street.py
# Output: data/green_street_raw.json

import json
import re
import time
from playwright.sync_api import sync_playwright

BASE_URL    = "https://www.greenstrealty.com/properties"
BASE_DOMAIN = "https://www.greenstrealty.com"
CRAWL_DELAY = 10  # seconds, per robots.txt Crawl-delay directive


def _scrape_detail(page, prop_url):
    """Visit one detail page and return property-level enrichment fields."""
    try:
        page.goto(prop_url, wait_until="networkidle")
        time.sleep(CRAWL_DELAY)
    except Exception as e:
        print(f"    ⚠ Failed to load {prop_url}: {e}")
        return {}

    desc_el   = page.query_selector("div.pp-info-html")
    desc_text = desc_el.inner_text().strip() if desc_el else ""

    amenity_els = page.query_selector_all("div.pp-amenities-data .pp-amenity-title")
    amenities   = ", ".join(
        el.inner_text().strip() for el in amenity_els if el.inner_text().strip()
    )

    def _extract(pattern):
        m = re.search(pattern, desc_text, re.IGNORECASE)
        return m.group(1).strip() if m else ""

    #   = non-breaking space from &nbsp; in raw HTML
    lease_dates  = _extract(r'Lease\s+dates?[\s: ]+(.+?)(?:\n|$)')
    utility_fees = _extract(r'Utility\s+fees?[\s: ]+(.+?)(?:\n|$)')

    brochure_el  = page.query_selector("div.pp-document-wrapper a[href^='/file/']")
    brochure_url = (BASE_DOMAIN + brochure_el.get_attribute("href")) if brochure_el else ""

    return {
        "description":  desc_text,
        "amenities":    amenities,
        "lease_dates":  lease_dates,
        "utility_fees": utility_fees,
        "brochure_url": brochure_url,
    }


def scrape_green_street():
    listings = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        pg = browser.new_page()
        pg.set_extra_http_headers({
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        })

        # ── Step 1: main listing page ──────────────────────────────────────
        pg.goto(BASE_URL, wait_until="networkidle")
        time.sleep(CRAWL_DELAY)

        cards = pg.query_selector_all("div.property-outer-wrapper")
        print(f"Found {len(cards)} property cards on main listing page")

        seen_urls = {}  # prop_url → True; insertion-order dedup (Python 3.7+)

        for card in cards:
            json_el = card.query_selector("script.property-info-json")
            if not json_el:
                continue
            try:
                data = json.loads(json_el.inner_text())
            except json.JSONDecodeError:
                print("  ⚠ JSON parse error — skipping card")
                continue

            address      = data.get("address_1", "")
            city         = data.get("city", "Champaign")
            state        = data.get("state", "IL")
            zip_code     = data.get("zip", "")
            full_address = f"{address}, {city}, {state} {zip_code}"
            prop_url     = data.get("url", "")
            area         = data.get("property_area", "")
            prop_type    = data.get("type_of_property", "")
            roommate     = data.get("roommate_match", "0") == "1"
            img_id       = data.get("img", "")
            photo_url    = f"{BASE_DOMAIN}/image/{img_id}/1800" if img_id else ""
            subtitle     = data.get("subtitle", "")

            if prop_url:
                seen_urls[prop_url] = True

            for fplan in data.get("fplans", []):
                listings.append({
                    "company":        "Green Street Realty",
                    "address":        full_address,
                    "area":           area,
                    "property_type":  prop_type,
                    "roommate_match": roommate,
                    "unit_type":      fplan.get("title", ""),
                    "beds":           fplan.get("beds", ""),
                    "baths":          fplan.get("baths", ""),
                    "sqft":           fplan.get("sqft", ""),
                    "price_total":    fplan.get("total_price", ""),
                    "price_per_bed":  fplan.get("price_per_bed", ""),
                    "availability":   fplan.get("availability", ""),
                    "url":            prop_url,
                    "photo_url":      photo_url,
                    "subtitle":       subtitle,
                    "description":    "",   # filled in Step 3
                    "amenities":      "",
                    "lease_dates":    "",
                    "utility_fees":   "",
                    "brochure_url":   "",
                    "text":           "",   # rebuilt in Step 3
                })

        # ── Step 2: detail pages (one per unique property) ─────────────────
        unique_urls = list(seen_urls.keys())
        print(f"Fetching detail pages for {len(unique_urls)} unique properties …")

        detail_cache = {}
        for i, url in enumerate(unique_urls, 1):
            print(f"  [{i}/{len(unique_urls)}] {url}")
            detail_cache[url] = _scrape_detail(pg, url)

        browser.close()

    # ── Step 3: back-fill detail fields + rebuild text ─────────────────────
    for listing in listings:
        d = detail_cache.get(listing["url"], {})
        listing["description"]  = d.get("description", "")
        listing["amenities"]    = d.get("amenities", "")
        listing["lease_dates"]  = d.get("lease_dates", "")
        listing["utility_fees"] = d.get("utility_fees", "")
        listing["brochure_url"] = d.get("brochure_url", "")

        # text field: structured facts only — kept within all-MiniLM-L6-v2's
        # 256-token limit. Full description stored separately for display.
        listing["text"] = " ".join(filter(None, [
            f"{listing['address']}.",
            f"{listing['unit_type']}: {listing['beds']} bed, {listing['baths']} bath"
            + (f", {listing['sqft']} sqft" if listing["sqft"] else "") + ".",
            f"Price: ${listing['price_per_bed']}/bed per month, ${listing['price_total']}/month total.",
            f"Availability: {listing['availability']}.",
            f"Area: {listing['area']}.",
            "Roommate match available." if listing["roommate_match"] else "",
            listing["subtitle"] + "." if listing["subtitle"] else "",
            f"Amenities: {listing['amenities']}." if listing["amenities"] else "",
            f"Lease dates: {listing['lease_dates']}." if listing["lease_dates"] else "",
            f"Utility fee: {listing['utility_fees']}." if listing["utility_fees"] else "",
            "Company: Green Street Realty.",
            f"Link: {listing['url']}",
        ]))

    return listings


if __name__ == "__main__":
    data = scrape_green_street()

    with open("data/green_street_raw.json", "w") as f:
        json.dump(data, f, indent=2)

    unique_props = len(set(d["address"] for d in data))
    print(f"✅ Saved {len(data)} floor plan listings from {unique_props} properties")
    print(f"   → data/green_street_raw.json")
