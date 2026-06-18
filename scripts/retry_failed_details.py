"""
scripts/retry_failed_details.py

Retry detail-page scraping for listings that timed out in the main run.
Identifies failed listings (empty description), re-scrapes their detail pages,
and patches data/green_street_raw.json in place.

Run:
    python -m scripts.retry_failed_details
"""

import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

RAW_FILE    = Path("data/green_street_raw.json")
BASE_DOMAIN = "https://www.greenstrealty.com"
CRAWL_DELAY = 10


def _scrape_detail(page, prop_url: str) -> dict:
    try:
        page.goto(prop_url, wait_until="networkidle", timeout=60_000)
        time.sleep(CRAWL_DELAY)
    except Exception as e:
        print(f"    ⚠ Failed again: {e}")
        return {}

    import re

    desc_el   = page.query_selector("div.pp-info-html")
    desc_text = desc_el.inner_text().strip() if desc_el else ""

    amenity_els = page.query_selector_all("div.pp-amenities-data .pp-amenity-title")
    amenities   = ", ".join(
        el.inner_text().strip() for el in amenity_els if el.inner_text().strip()
    )

    def _extract(pattern):
        m = re.search(pattern, desc_text, re.IGNORECASE)
        return m.group(1).strip() if m else ""

    lease_dates  = _extract(r'Lease\s+dates?[\s: ]+(.+?)(?:\n|$)')
    utility_fees = _extract(r'Utility\s+fees?[\s: ]+(.+?)(?:\n|$)')

    brochure_el  = page.query_selector("div.pp-document-wrapper a[href^='/file/']")
    brochure_url = (BASE_DOMAIN + brochure_el.get_attribute("href")) if brochure_el else ""

    return {
        "description":  desc_text,
        "amenities":    amenities,
        "lease_dates":  lease_dates,
        "utility_fees": utility_fees,
        "brochure_url": brochure_url,
    }


def main():
    data = json.loads(RAW_FILE.read_text())

    # Find unique URLs where description is empty (timed out)
    failed_urls = sorted({
        d["url"] for d in data
        if d.get("url") and not d.get("description")
    })

    if not failed_urls:
        print("No failed listings found — all descriptions present.")
        return

    print(f"Found {len(failed_urls)} URLs with missing detail data:")
    for url in failed_urls:
        print(f"  {url}")
    print()

    results = {}
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

        for i, url in enumerate(failed_urls, 1):
            print(f"[{i}/{len(failed_urls)}] {url}")
            results[url] = _scrape_detail(pg, url)

        browser.close()

    # Patch in place
    patched = 0
    for listing in data:
        url = listing.get("url")
        if url in results and results[url]:
            d = results[url]
            listing["description"]  = d.get("description", "")
            listing["amenities"]    = d.get("amenities", "")
            listing["lease_dates"]  = d.get("lease_dates", "")
            listing["utility_fees"] = d.get("utility_fees", "")
            listing["brochure_url"] = d.get("brochure_url", "")
            patched += 1

    RAW_FILE.write_text(json.dumps(data, indent=2))
    print(f"\n✅ Patched {patched} listings → {RAW_FILE}")

    # Report any still-empty
    still_empty = [url for url in failed_urls if not results.get(url)]
    if still_empty:
        print(f"⚠ Still failed ({len(still_empty)}):")
        for url in still_empty:
            print(f"  {url}")


if __name__ == "__main__":
    main()
