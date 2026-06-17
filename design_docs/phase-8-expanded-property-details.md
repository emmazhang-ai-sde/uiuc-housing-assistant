# Phase 8 — Expanded Property Details

## Goal

When a user clicks a building address, show an in-app detail drawer or modal with richer information than what currently lives in the listing cards. The direct link-out moves inside the drawer.

The guiding principle: **scrape whatever each company's website actually provides and include it.** Different companies publish different levels of detail — the schema is a superset; fields that a given company doesn't provide are simply left blank.

---

## Common fields (target for all companies)

| Field | Source |
|---|---|
| Proximity to campus | Computed from geocoded coordinates + UIUC reference point (depends on Phase 7) |
| Amenities | Scraped from listing page (private balcony, garage, covered parking, etc.) |
| Bus line access | Scraped or cross-referenced with MTD GTFS data |
| Laundry | Scraped (on-site vs. in-unit) |
| Utility fees | Scraped from listing detail page |
| Lease dates | Scraped from listing detail page |
| Exterior photo | Scraped from listing page (first image) |

---

## Company-specific fields

Some companies publish details that others don't. These are captured as additional fields when available:

| Field | Company | Notes |
|---|---|---|
| Floor-level notes | Universities Group | Per-floor comments (e.g. "3rd floor — corner unit, quieter") |
| Per-floor pricing | Universities Group | Price variation by floor, not just a single low/high range |
| *(others TBD)* | GSR / new companies | To be discovered when expanding each scraper |

---

## Implementation approach

- For each company, inspect the listing detail page and document every field it exposes **before** writing any scraper code
- Expand each scraper to pull detail-page fields in addition to the existing list-page data
- Use a flexible `extras: dict` column in SQLite to store company-specific fields without schema migrations for every new field
- Add the most universally useful fields as first-class Chroma metadata; company-specific extras live in the detail payload only
- Frontend: replace the direct link-out with a click that opens a detail drawer/modal; the "View on website" link moves inside the drawer

---

## Checklist

- [ ] For each company, audit the listing detail page and document all available fields before scraping
- [ ] Expand GSR scraper to pull detail-page fields
- [ ] Expand UG scraper to pull detail-page fields (incl. floor-level notes and per-floor pricing)
- [ ] Add `extras` dict column to SQLite schema for company-specific fields
- [ ] Add common fields as Chroma metadata; surface company-specific extras in detail payload
- [ ] Build detail drawer/modal in frontend
