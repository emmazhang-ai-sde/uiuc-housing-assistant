# scrapers/green_street.py
# Green Street Realty — UIUC Housing Scraper
#
# Strategy: each property card contains a hidden
#   <script type="application/json" class="property-info-json">
# tag with ALL property data as structured JSON.
# We parse that directly — no fragile HTML element scraping needed.
#
# Run:    python scrapers/green_street.py
# Output: green_street_raw.json

from playwright.sync_api import sync_playwright
import json
import time
import time  # ready for when we add per-property page visits

BASE_URL = "https://www.greenstrealty.com/properties"


def scrape_green_street():
    listings = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Mimic a real browser to avoid 403 blocks
        page.set_extra_http_headers({
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        })

        # Wait until all JS and network activity settles before reading the DOM
        page.goto(BASE_URL, wait_until="networkidle")
        time.sleep(10)  # respect Crawl-delay: 10 from robots.txt

        # Every property card sits inside a div.property-outer-wrapper
        cards = page.query_selector_all("div.property-outer-wrapper")
        print(f"Found {len(cards)} property cards on the page")

        for card in cards:
            # Each card embeds a <script type="application/json" class="property-info-json">
            # containing ALL property data as structured JSON — no HTML element scraping needed
            json_el = card.query_selector("script.property-info-json")
            if not json_el:
                continue

            try:
                data = json.loads(json_el.inner_text())
            except json.JSONDecodeError:
                print("  ⚠ Could not parse JSON for one card — skipping")
                continue

            # ── Property-level fields (same for all floor plans at this address) ──
            address      = data.get("address_1", "")
            city         = data.get("city", "Champaign")
            state        = data.get("state", "IL")
            zip_code     = data.get("zip", "")
            full_address = f"{address}, {city}, {state} {zip_code}"
            prop_url     = data.get("url", "")
            area         = data.get("property_area", "")    # "on-campus", "downtown", etc.
            prop_type    = data.get("type_of_property", "") # "Apartment", etc.
            roommate     = data.get("roommate_match", "0") == "1"

            # ── Floor plan–level fields (one row per plan per property) ──
            # A single address can have 1BR / 2BR / 3BR / 4BR plans,
            # each with its own price and availability status.
            for fplan in data.get("fplans", []):
                availability  = fplan.get("availability", "")   # e.g. "Available August 2026" or "Leased"
                title         = fplan.get("title", "")          # e.g. "3 Bedroom"
                beds          = fplan.get("beds", "")           # e.g. "3"
                baths         = fplan.get("baths", "")          # e.g. "3.0"
                sqft          = fplan.get("sqft", "")
                price_total   = fplan.get("total_price", "")    # e.g. "2700" or "3500-3600"
                price_per_bed = fplan.get("price_per_bed", "")  # e.g. "900" or "875-900"

                listings.append({
                    "company":        "Green Street Realty",
                    "address":        full_address,
                    "area":           area,
                    "property_type":  prop_type,
                    "roommate_match": roommate,
                    "unit_type":      title,
                    "beds":           beds,
                    "baths":          baths,
                    "sqft":           sqft,
                    "price_total":    price_total,
                    "price_per_bed":  price_per_bed,
                    "availability":   availability,
                    "url":            prop_url,
                    # ── RAG text chunk ──────────────────────────────────────
                    # This is what gets embedded into Chroma for semantic search.
                    # Richer, natural-language text = better retrieval quality.
                    "text": (
                        f"{address}, Champaign IL. "
                        f"{title}: {beds} bed, {baths} bath"
                        f"{', ' + sqft + ' sqft' if sqft else ''}. "
                        f"Price: ${price_per_bed}/bed per month, ${price_total}/month total. "
                        f"Availability: {availability}. "
                        f"Area: {area}. "
                        f"{'Roommate match available. ' if roommate else ''}"
                        f"Company: Green Street Realty. "
                        f"Link: {prop_url}"
                    )
                })

        browser.close()

    return listings


if __name__ == "__main__":
    data = scrape_green_street()

    with open("green_street_raw.json", "w") as f:
        json.dump(data, f, indent=2)

    unique_props = len(set(d["address"] for d in data))
    print(f"✅ Saved {len(data)} floor plan listings from {unique_props} properties")
    print(f"   → green_street_raw.json")


