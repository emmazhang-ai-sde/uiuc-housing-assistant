# Phase 8.3 — Data Coverage Audit: GSR vs Universities Group

**Created: 2026-06-18**

---

## Overview

Two data sources have now been fully scraped and ingested into the combined snapshot (`listings_2026-06-17.db`). This document audits field coverage across both sources, identifies gaps, and assesses downstream impact on search quality and the detail drawer UI.

| Source | Listings | Unique Properties |
|--------|----------|-------------------|
| Green Street Realty (GSR) | 494 | 252 |
| Universities Group (UG) | 389 | 159 |
| **Total** | **883** | **411** |

---

## Field Coverage Matrix

Legend: ✅ well-covered (≥80%) · ⚠️ partial (20–79%) · ❌ absent or sparse (<20%)

| Field | GSR | UG | Notes |
|-------|-----|----|-------|
| `address` | ✅ 494/494 (100%) | ✅ 389/389 (100%) | |
| `area` | ✅ 494/494 (100%) | ✅ 389/389 (100%) | **Schema mismatch** — see Area Analysis section |
| `property_type` | ✅ 494/494 (100%) | ✅ 389/389 (100%) | |
| `unit_type` | ✅ 489/494 (98%) | ✅ 389/389 (100%) | Floor plan label |
| `beds` | ✅ 449/494 (90%) | ✅ 326/389 (83%) | UG includes Studio (0 bed) |
| `baths` | ✅ 485/494 (98%) | ✅ 388/389 (99%) | |
| `price_per_bed_low` | ✅ 458/494 (92%) | ⚠️ 285/389 (73%) | |
| `price_per_bed_high` | ✅ 457/494 (92%) | ⚠️ 285/389 (73%) | |
| `price_total_low` | ✅ 473/494 (95%) | ⚠️ 285/389 (73%) | |
| `price_total_high` | ✅ 473/494 (95%) | ⚠️ 285/389 (73%) | |
| `availability` | ✅ 492/494 (99%) | ✅ 389/389 (100%) | Raw status string |
| `url` | ✅ 494/494 (100%) | ✅ 389/389 (100%) | |
| `photo_url` | ✅ 492/494 (99%) | ✅ 389/389 (100%) | |
| `lat` / `lng` | ✅ 492/494 (99%) | ✅ 389/389 (100%) | Geocoded |
| `tagline` | ⚠️ 276/494 (55%) | ⚠️ 300/389 (77%) | GSR: promotional text from listing; UG: availability badge |
| `availability_summary` | ❌ 0/494 (0%) | ✅ 359/389 (92%) | **GSR does not publish this field** |
| `sqft` | ⚠️ 204/494 (41%) | ❌ 0/389 (0%) | **UG does not publish sqft** |
| `roommate_match` | ⚠️ 65/494 (13%) | ❌ 0/389 (0%) | GSR-only feature; UG has no equivalent |
| `description` | ✅ 470/494 (95%) | ❌ 0/389 (0%) | **UG detail pages not yet scraped** |
| `amenities` | ⚠️ 48/494 (9%) | ❌ 0/389 (0%) | GSR structured tags are sparse; most amenities live in `description` prose |
| `lease_dates` | ⚠️ 330/494 (66%) | ❌ 0/389 (0%) | **UG detail pages not yet scraped** |
| `utility_fees` | ⚠️ 311/494 (62%) | ❌ 0/389 (0%) | **UG detail pages not yet scraped** |
| `brochure_url` | ⚠️ 147/494 (29%) | ❌ 0/389 (0%) | **UG detail pages not yet scraped** |

---

## Summary by Coverage Type

### Fully covered by both sources (✅ / ✅)
`address`, `area`, `property_type`, `unit_type`, `beds`, `baths`, `availability`, `url`, `photo_url`, `lat`, `lng`

These fields are reliable across the full 883-listing dataset and can be used unconditionally in search filters, card display, and the map view.

### Partially covered — source asymmetry

| Field | Covered by | Gap |
|-------|-----------|-----|
| `availability_summary` | UG only (92%) | GSR has no equivalent; drawer shows this only for UG listings |
| `sqft` | GSR only (41%) | UG publishes no sqft data |
| `roommate_match` | GSR only (13%) | UG has no roommate-match program |
| `description` + `lease_dates` + `utility_fees` + `brochure_url` | GSR only (62–95%) | UG detail pages have not been scraped yet |
| `amenities` | GSR only (9%) | Low coverage even within GSR — most amenity info is in `description` prose |
| `tagline` | Both (55–77%) | Semantically different: GSR uses promotional offers; UG uses availability labels |
| `price_*` | Both, but UG only 73% | 104 UG listings have no price published |

### Absent from both sources
None — all schema fields come from at least one source.

---

## Bed Type Distribution

| Beds | GSR | UG |
|------|-----|----|
| Studio (0) | — | 63 |
| 1 | 99 | 95 |
| 2 | 146 | 137 |
| 3 | 132 | 50 |
| 4 | 72 | 41 |
| 5+ | — | 3 |
| Unknown | 45 | 63 |

GSR does not publish Studios; UG covers 5+ bed units (large houses).

---

## Price Range

| Source | Min $/bed | Max $/bed | Avg $/bed |
|--------|-----------|-----------|-----------|
| Green Street Realty | $360 | $2,200 | $810 |
| Universities Group | $250 | $1,840 | $1,030 |

GSR skews cheaper on average; UG has a higher average likely due to more studio/luxury single-bed units.

---

## sqft (GSR only)

| Metric | Value |
|--------|-------|
| Min | 200 sqft |
| Max | 3,630 sqft |
| Avg | 1,043 sqft |
| Coverage | 204/494 (41%) |

UG publishes no sqft data. sqft-based filtering is GSR-only for now.

---

## Availability Values

### GSR — `availability` field
| Value | Count |
|-------|-------|
| Leased | 345 (69%) |
| Available August 2026 | 134 (27%) |
| Available Now | 10 (2%) |
| Available June 2026 | 2 |
| (empty) | 2 |

### UG — `availability_summary` field
| Value | Count |
|-------|-------|
| Available August 2026 | 137 (38%) |
| Fully Leased for August 2026 | 44 (12%) |
| Fully Leased – Not Available | 62 (17%) |
| Fully leased for August 2026 | 17 (5%) |
| Other variants | 99 (28%) |

**Key asymmetry:** GSR uses a raw `availability` field with terse values; UG uses the richer `availability_summary` with marketing-style phrases. The detail drawer shows whichever is non-empty.

---

## Implications for Phase 9+

### Detail drawer gaps
- UG listings show no `description`, `amenities`, `lease_dates`, `utility_fees`, or `brochure_url` — the drawer's lower sections are empty for all 389 UG listings.
- **Fix:** Scrape UG detail pages (Phase 9 candidate).

### Search quality gaps
- Amenity-based queries ("in-unit laundry", "parking") only work for GSR listings via the `description` text. UG listings have no amenity information at all.
- sqft-based queries ("large floor plan") only return GSR results.

### Price coverage gap
- 104 UG listings (27%) have no price. These listings can still appear in results but cannot be filtered by budget. The backend already handles `price_per_bed_low = 0` as "unpriced."

### Tagline field semantics diverge
- GSR tagline = promotional offer text (e.g., `"$500 GIFT CARD SIGNING BONUS"`)
- UG tagline = availability marketing copy (e.g., `"NOW LEASING FOR AUGUST 2026!"`)
- Both display in the drawer's tagline row — this is acceptable for now, but a future cleanup could split into `promo_text` vs `availability_label`.

---

## Area Field Analysis

Both sources cover `area` at 100%, but the schemas are fundamentally different.

### GSR — binary flag (2 values)

| Value | Count |
|-------|-------|
| `"on-campus"` | 344 (70%) |
| `"off-campus"` | 150 (30%) |

GSR assigns a single coarse label per property. No sub-zones.

### UG — multi-zone comma-separated string (34 distinct strings → 11 atomic tokens)

Each UG listing belongs to 1–6 named zones, stored as a comma-separated string. Decomposed into atomic tokens:

| Zone token | Listing count |
|-----------|--------------|
| West Campus | 226 |
| North Campus (Near County Market) | 160 |
| South Campus (Champaign) | 144 |
| Champaign Engineering / ECE | 142 |
| East Campus | 133 |
| Urbana Engineering / ECE | 111 |
| Off Campus | 53 |
| South Campus (Urbana) | 53 |
| Downtown Champaign | 50 |
| Senior Land | 23 |
| Downtown Urbana | 23 |

**Note:** `"Senior Land"` appears on only one property (60 E. Green St.) and is a UG-specific promotional label, not a geographic zone.

### Merge feasibility

| GSR value | UG equivalent | Match quality |
|-----------|--------------|---------------|
| `"on-campus"` | Any listing WITHOUT `"Off Campus"` token (336 listings) | Approximate — GSR lumps all campus-adjacent zones together |
| `"off-campus"` | Listings with `"Off Campus"` token only (14 listings, pure off-campus) | Partial — 39 UG listings have both campus-zone tokens AND "Off Campus", meaning they are near campus but tagged off-campus |

**Key finding:** The two schemas cannot be merged without data loss. GSR uses coarse on/off binary; UG uses granular multi-zone membership. A unified area taxonomy would require:

1. Expanding GSR from 2 values → sub-zones (requires geocoding-based assignment, not available from raw data)
2. Or: introducing a `campus_proximity` boolean derived from both (GSR on-campus = true; UG = absence of "Off Campus" token)

### Proposed unified zone vocabulary (for Phase 9+)

Based on the 11 UG tokens, a clean normalized set that could also cover GSR:

| Canonical zone | Maps from |
|----------------|-----------|
| `on-campus` | GSR "on-campus"; UG listings with no "Off Campus" token |
| `off-campus` | GSR "off-campus"; UG "Off Campus"-only listings |
| `west-campus` | UG "West Campus" |
| `north-campus` | UG "North Campus (Near County Market)" |
| `south-campus-champaign` | UG "South Campus (Champaign)" |
| `south-campus-urbana` | UG "South Campus (Urbana)" |
| `east-campus` | UG "East Campus" |
| `champaign-engineering` | UG "Champaign Engineering / ECE" |
| `urbana-engineering` | UG "Urbana Engineering / ECE" |
| `downtown-champaign` | UG "Downtown Champaign" |
| `downtown-urbana` | UG "Downtown Urbana" |

GSR properties would need geocoding-based zone assignment to map into this vocabulary. This is a Phase 9 candidate.

### Alternative approach: coordinate-based zone assignment

**Idea:** Discard scraped area tags entirely. Instead, compute each property's zone membership dynamically from its lat/lng coordinates — rank or filter by distance to known landmarks rather than relying on either source's labeling system.

**Pros**
- Source-agnostic: doesn't depend on GSR's arbitrary binary or UG's inconsistent multi-tag strings
- Already have the data: lat/lng is 99–100% covered on both sources
- Enables distance-based sorting ("sort by proximity to Grainger") — something tag-based systems can't do
- Higher precision than GSR's coarse on/off-campus binary

**Cons**
- UIUC campus is elongated N–S, not circular. Distance from a single center point doesn't distinguish "near Engineering quad" from an unrelated neighborhood at the same radius
- Students think in zones, not distances. UG's 11 tokens encode domain knowledge ("Champaign Engineering / ECE" = near Grainger/ECEB) that a distance number doesn't capture
- Requires choosing a reference point. Multiple landmarks are needed, which adds complexity; a single campus center is too coarse
- "On-campus" is an administrative concept, not a geometric one — the boundary is an irregular polygon, not a radius

**Assessment (as of 2026-06-18):** With only two data sources, the area taxonomy is still too thin to commit to a final schema. The coordinate approach is more suitable as a *ranking/proximity filter* layer (already partially implemented via `filter_by_location`) than as a replacement for the area display field. A polygon-containment approach (similar to the existing MAIN_QUAD_GEOJSON) would be more accurate than pure distance if zone classification is needed for GSR properties.

**Decision deferred** until more rental companies are added. At that point the zone vocabulary will be more stable and worth normalizing across sources.

---

## Checklist

- [x] Audit field coverage across both sources
- [x] Document source-specific fields and gaps
- [x] Identify missing UG data (detail pages)
- [ ] Phase 9: scrape UG detail pages for description, amenities, lease_dates, utility_fees, brochure_url
