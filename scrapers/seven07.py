# scrapers/seven07.py
# Seven07 (707 S 4th St, Champaign) — UIUC Housing Scraper
#
# Strategy:
#   Single building managed by Cardinal Group; the "0707" entry in Phase 9.
#   WordPress site whose /floor-plans/ page server-renders the full Entrata
#   dataset into a Vue attribute:  :floor_plans='[...JSON...]'  — title, beds,
#   baths, price_min/max, size, is_sold_out, first_available_date,
#   available_units, lease_options, gallery. So this scraper is ONE page fetch:
#   regex the attribute out, html.unescape, json.loads. No Playwright, no
#   Entrata API, no per-floorplan page visits.
#
#   Pricing rule: rents are per bed (every lease option is space_option
#   "Private" — individual by-the-bed leases; 4BR/bed < studio/bed confirms).
#   price_total = rent × beds; studios and 1BRs both equal the rent.
#   Multi-bed floorplans lease bedrooms individually → roommate_match = True.
#
#   Cloudflare fronts the site and rejects bare curl but serves browser-header
#   requests with a plain 200 (no JS challenge). If that ever escalates to a
#   real challenge, stop and reassess — do not bypass.
#
#   Failure model: all-or-nothing. A failed request exits nonzero and writes
#   nothing, so the output can never mix fresh and stale data. No retry modes.
#   See design-docs/ai-pipeline-implementation-phases/phase-9.3-seven07-scraper.md
#
# Run:    python scrapers/seven07.py
# Output: data/seven07_raw.json                                (canonical latest, read by normalize)
#         data/raw_archive/seven07_raw_YYYY-MM-DD_HHMMSS.json  (timestamped archive, every run)
# Save/archive logic lives in scrapers/_archive.py

import html
import json
import re
from datetime import date, datetime

import requests

from _archive import save_scrape

FLOOR_PLANS_URL = "https://liveseven07.com/floor-plans/"
COMPANY         = "Seven07"
ADDRESS         = "707 S 4th St., Champaign"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


def fetch_floor_plans() -> list[dict]:
    resp = requests.get(
        FLOOR_PLANS_URL,
        headers={
            "User-Agent":      USER_AGENT,
            "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        },
        timeout=30,
    )
    resp.raise_for_status()
    m = re.search(r":floor_plans='(\[.*?\])'", resp.text, re.S)
    if not m:
        raise RuntimeError("floor_plans attribute not found — page structure changed?")
    return json.loads(html.unescape(m.group(1)))


def price_str(lo, hi) -> str:
    lo, hi = str(lo or "").strip(), str(hi or "").strip()
    if not lo:
        return ""
    return lo if lo == hi or not hi else f"{lo}-{hi}"


def availability_strings(f: dict) -> tuple[str, str]:
    """('Available now (5 units left)', 'Available now') etc."""
    if f.get("is_sold_out"):
        return "Leased", "Leased"

    units = f.get("available_units") or 0
    note  = f" ({units} unit{'s' if units != 1 else ''} left)" if units else ""

    # first_available_date is "YYYY-MM-DD", or an empty JSON array when absent
    raw = f.get("first_available_date")
    if isinstance(raw, str) and raw:
        d = datetime.strptime(raw, "%Y-%m-%d").date()
        if d > date.today():
            return (
                f"Available {d.strftime('%B')} {d.day}, {d.year}{note}",
                f"Available {d.strftime('%B %Y')}",
            )
    return f"Available now{note}", "Available now"


def to_record(f: dict) -> dict:
    title  = html.unescape(f.get("title") or "").strip()
    beds_n = int(f.get("bedrooms") or 0)
    baths  = str(f.get("bathrooms") or "").strip()
    sqft   = str(f.get("size_min") or "").strip()

    per_bed = price_str(f.get("price_min"), f.get("price_max"))
    if beds_n >= 2 and per_bed:
        lo_hi = [int(x) for x in per_bed.split("-")]
        total = price_str(lo_hi[0] * beds_n, lo_hi[-1] * beds_n)
    else:
        total = per_bed

    availability, availability_summary = availability_strings(f)

    # Annual lease term start/end, e.g. "08/16/2026 - 07/27/2027"
    lease_dates = ""
    for opt in f.get("lease_options") or []:
        if opt.get("lease_term_name") == "Annual":
            lease_dates = f"{opt.get('start_date', '')} - {opt.get('end_date', '')}".strip(" -")
            break

    image     = f.get("image") or {}
    photo_url = image.get("url") or ""

    return {
        "company":              COMPANY,
        "address":              ADDRESS,
        "area":                 "",
        "property_type":        "Apartment",
        # bedrooms lease individually (space_option "Private") — see module docstring
        "roommate_match":       beds_n >= 2,
        "unit_type":            title,
        "beds":                 str(beds_n),
        "baths":                baths,
        "sqft":                 sqft,
        "price_total":          total,
        "price_per_bed":        per_bed,
        "availability":         availability,
        "url":                  f.get("link") or FLOOR_PLANS_URL,
        "photo_url":            photo_url,
        "availability_summary": availability_summary,
        "tagline":              (f.get("current_special_text") or "").strip(),
        "description":          "",
        "amenities":            "",
        "lease_dates":          lease_dates,
        "text": (
            f"{ADDRESS}. {title}: {beds_n} bed, {baths} bath"
            + (f", {sqft} sqft" if sqft else "") + ". "
            + (f"Price: ${per_bed}/bed per month, ${total}/month total. " if per_bed else "")
            + f"Availability: {availability}. Company: {COMPANY}. Link: {f.get('link') or FLOOR_PLANS_URL}"
        ),
    }


def main():
    print(f"Fetching floor plans: {FLOOR_PLANS_URL}")
    plans = fetch_floor_plans()
    print(f"Found {len(plans)} floor plans")

    listings = [to_record(f) for f in plans]
    listings.sort(key=lambda x: (x["address"], x["unit_type"]))
    save_scrape(listings, "seven07", failed=0)


if __name__ == "__main__":
    main()
