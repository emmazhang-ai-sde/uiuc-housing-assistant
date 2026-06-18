# Phase 8.2 — Green Street Realty: Expanded Property Details

## Goal

Enrich every GSR listing record with the same property-level fields added for UG in Phase 8.1: exterior photo, availability summary, tagline. Also audit for additional fields (amenities, laundry, utility fees, lease dates) from the embedded JSON blob and/or individual property detail pages.

---

## Source pages & field availability

> `greenstrealty.com` shares a single [robots.txt](https://www.greenstrealty.com/robots.txt) (`Crawl-delay: 10` respected).

| Field | `/properties` ✅ | `/properties/<slug>/` ❓ |
|---|---|---|
| **URL** | `greenstrealty.com/properties` | `greenstrealty.com/properties/<slug>/` |
| **Scope** | All properties, single page | Individual property detail |
| **robots.txt** | ✅ Permitted (delay 10 s) | ✅ Permitted (delay 10 s) |
| `photo_url` | ❓ audit JSON blob | ❓ |
| `availability_summary` | ❓ audit JSON blob | ❓ |
| `tagline` | ❓ audit JSON blob | ❓ |
| `area` | ✅ `property_area` | — |
| `unit_type` | ✅ `fplans[].title` | — |
| `price_total` | ✅ `fplans[].total_price` | — |
| `price_per_bed` | ✅ `fplans[].price_per_bed` | — |
| `availability` | ✅ `fplans[].availability` | — |
| `baths` | ✅ `fplans[].baths` | — |
| `beds` | ✅ `fplans[].beds` | — |
| `sqft` | ✅ `fplans[].sqft` | — |
| `amenities` | ❓ audit JSON blob | ❓ |
| `laundry` | ❓ audit JSON blob | ❓ |
| `utility_fees` | ❓ audit JSON blob | ❓ |
| `lease_dates` | ❓ audit JSON blob | ❓ |

> ❓ = unknown until JSON blob is audited. GSR embeds **all** property data in a hidden `<script class="property-info-json">` tag — many Phase 8 fields may already be present without any additional scraping.

---

## Scraping strategy

GSR's architecture is fundamentally different from UG:

- **UG** requires two separate page fetches: `/building-list/` (property-level) + individual detail pages (unit-level).
- **GSR** loads all properties on a single `/properties` page, each card embedding a complete structured JSON blob. The current scraper already reads this blob and extracts ~12 fields.

**Phase 8.2 is therefore an audit-first task:**
1. Dump a raw blob from one property card
2. Identify all keys present in the blob
3. Map them to Phase 8 target fields
4. Extract any that are already there — no new page fetches needed
5. For fields not in the blob, check the individual property detail page (`/properties/<slug>/`)

---

## Fields currently captured (existing scraper)

| Field | JSON key |
|---|---|
| `address` | `address_1` + `city` + `state` + `zip` |
| `area` | `property_area` |
| `property_type` | `type_of_property` |
| `roommate_match` | `roommate_match` |
| `unit_type` | `fplans[].title` |
| `beds` | `fplans[].beds` |
| `baths` | `fplans[].baths` |
| `sqft` | `fplans[].sqft` |
| `price_total` | `fplans[].total_price` |
| `price_per_bed` | `fplans[].price_per_bed` |
| `availability` | `fplans[].availability` |
| `url` | `url` |

---

## Checklist

- [ ] Audit step: dump one raw `property-info-json` blob and list all keys
- [ ] Map blob keys → Phase 8 target fields (`photo_url`, `availability_summary`, `tagline`, amenities, laundry, utility fees, lease dates)
- [ ] Extract all available fields directly from the blob (no new page fetches)
- [ ] For fields not in the blob: inspect one property detail page (`/properties/<slug>/`) and document HTML selectors
- [ ] Update `scrapers/green_street.py` to extract new fields
- [ ] Update `frontend/CHANGELOG.md` with any UI changes
- [ ] Run pipeline: `normalize` → `geocode` → `ingest`
