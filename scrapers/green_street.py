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
# Incremental fill (default): price/availability/beds/baths/sqft always come fresh
# from Step 1 (the list page), so they're never stale. Detail pages only carry
# static enrichment (description, amenities, lease dates, utility fees, brochure),
# so a property whose detail page was already fetched successfully in a previous
# run is reused instead of re-fetched. Re-run the script as many times as needed;
# each run only fetches whatever detail pages are still missing, until complete.
# Pass --fresh to ignore the previous file and re-fetch every detail page.
# See design-docs/ai-pipeline-implementation-phases/phase-5.2.1-green-street-scraper.md
#
# Run:    python scrapers/green_street.py            # incremental fill (default)
#         python scrapers/green_street.py --fresh    # re-fetch all detail pages
# Output: data/green_street_raw.json                                (canonical latest, read by normalize)
#         data/raw_archive/green_street_raw_YYYY-MM-DD_HHMMSS.json  (timestamped archive, every run;
#         a run with missing detail pages is saved as ..._partial.json and auto-removed once a
#         complete run succeeds)
# Save/archive logic lives in scrapers/_archive.py

import argparse
import json
import os
import re
import time
from playwright.sync_api import sync_playwright

from _archive import save_scrape

BASE_URL       = "https://www.greenstrealty.com/properties"
BASE_DOMAIN    = "https://www.greenstrealty.com"
CRAWL_DELAY    = 10  # seconds, per robots.txt Crawl-delay directive
CANONICAL_PATH = "data/green_street_raw.json"


def _scrape_detail(page, prop_url):
    """Visit one detail page and return property-level enrichment fields."""
    # Don't wait for full network idle: pages with persistent background connections
    # (analytics, polling) never go quiet, so networkidle spuriously times out. Wait
    # for the DOM to parse instead, retrying the navigation once on hard failures.
    for attempt in range(1, 3):
        try:
            page.goto(prop_url, wait_until="domcontentloaded")
            break
        except Exception as e:
            print(f"    ⚠ Attempt {attempt}/2 failed for {prop_url}: {e}")
            if attempt == 2:
                print(f"    ⚠ Giving up on {prop_url}")
                return {}

    # Best-effort wait for the main description block. Some properties legitimately
    # have no description, so a timeout here is fine: parse whatever did render.
    try:
        page.wait_for_selector("div.pp-info-html", timeout=15000)
    except Exception:
        pass

    time.sleep(CRAWL_DELAY)

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


def load_previous_details(path: str) -> dict[str, dict]:
    """Return {url: detail_fields} for properties whose detail page was
    successfully fetched in a previous run (detail_ok is True). Properties
    with no detail_ok key at all (raw files predating this field) are treated
    as not-yet-fetched, so the very first run after upgrading re-fetches
    everything once; after that, incremental fill applies normally.
    """
    if not os.path.exists(path):
        return {}
    try:
        previous = json.loads(open(path).read())
    except (json.JSONDecodeError, OSError):
        return {}

    reuse: dict[str, dict] = {}
    for listing in previous:
        url = listing.get("url", "")
        if url and listing.get("detail_ok") and url not in reuse:
            reuse[url] = {
                "description":  listing.get("description", ""),
                "amenities":    listing.get("amenities", ""),
                "lease_dates":  listing.get("lease_dates", ""),
                "utility_fees": listing.get("utility_fees", ""),
                "brochure_url": listing.get("brochure_url", ""),
            }
    return reuse


def scrape_green_street(fresh: bool = False):
    reuse    = {} if fresh else load_previous_details(CANONICAL_PATH)
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
        # domcontentloaded + wait for the cards, not networkidle (see _scrape_detail).
        pg.goto(BASE_URL, wait_until="domcontentloaded")
        pg.wait_for_selector("div.property-outer-wrapper", timeout=30000)
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

        # ── Step 2: detail pages (one per unique property, minus reused) ────
        unique_urls = list(seen_urls.keys())
        to_fetch    = [u for u in unique_urls if u not in reuse]

        if fresh:
            print(f"Mode: FRESH — ignoring previous file, fetching all {len(unique_urls)} detail pages")
        else:
            print(f"Mode: INCREMENTAL FILL — reusing {len(reuse)} already-enriched properties, "
                  f"fetching {len(to_fetch)} missing")

        detail_cache = dict(reuse)
        failed = 0
        for i, url in enumerate(to_fetch, 1):
            print(f"  [{i}/{len(to_fetch)}] {url}")
            detail = _scrape_detail(pg, url)
            if not detail:            # {} means navigation gave up after retries
                failed += 1
            detail_cache[url] = detail

        browser.close()

    # ── Step 3: back-fill detail fields + rebuild text ─────────────────────
    for listing in listings:
        d = detail_cache.get(listing["url"], {})
        listing["description"]  = d.get("description", "")
        listing["amenities"]    = d.get("amenities", "")
        listing["lease_dates"]  = d.get("lease_dates", "")
        listing["utility_fees"] = d.get("utility_fees", "")
        listing["brochure_url"] = d.get("brochure_url", "")
        # True whenever d came from a successful fetch (this run or reused) —
        # d is a non-empty dict either way; {} (total failure) is falsy.
        listing["detail_ok"]    = bool(d)

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

    return listings, failed


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--fresh", action="store_true",
        help="Ignore the previous raw file and re-fetch every detail page "
             "(default: reuse already-enriched properties, only fetch what's missing)",
    )
    args = parser.parse_args()

    data, failed = scrape_green_street(fresh=args.fresh)
    save_scrape(data, "green_street", failed)
