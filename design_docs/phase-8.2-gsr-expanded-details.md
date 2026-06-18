# Phase 8.2 — Green Street Realty: Expanded Property Details

## Goal

Enrich every GSR listing record with property-level fields from individual detail pages: exterior photo, description, and amenities. GSR does **not** publish `availability_summary` or `tagline` equivalents — those fields remain `""` for GSR records.

---

## robots.txt — full content

```
User-agent: AI2Bot
User-agent: Ai2Bot-Dolma
User-agent: Amazonbot
User-agent: Brightbot 1.0
User-agent: Bytespider
User-agent: CCBot
User-agent: cohere-ai
User-agent: cohere-training-data-crawler
User-agent: Crawlspace
User-agent: Diffbot
User-agent: DuckAssistBot
User-agent: FacebookBot
User-agent: FriendlyCrawler
User-agent: iaskspider/2.0
User-agent: ICC-Crawler
User-agent: ImagesiftBot
User-agent: img2dataset
User-agent: ISSCyberRiskCrawler
User-agent: Kangaroo Bot
User-agent: Meta-ExternalAgent
User-agent: Meta-ExternalFetcher
User-agent: omgili
User-agent: omgilibot
User-agent: PanguBot
User-agent: PetalBot
User-agent: Scrapy
User-agent: SemrushBot-OCOB
User-agent: SemrushBot-SWA
User-agent: Sidetrade indexer bot
User-agent: Timpibot
User-agent: VelenPublicWebCrawler
User-agent: Webzio-Extended
User-agent: YouBot
Disallow: /

User-agent: *
Content-signal: search=yes,ai-train=no
Crawl-delay: 10
Disallow: /cdn-cgi/
Disallow: /backend/
Disallow: /modules/
Sitemap: https://www.greenstrealty.com/sitemap.xml
```

### Analysis

**Two-tier policy:**

| Tier | Who it applies to | Rule |
|---|---|---|
| Named AI bots (33 entries) | CCBot, Bytespider, FacebookBot, cohere-ai, Diffbot, etc. | `Disallow: /` — fully blocked |
| Everyone else (`*`) | All other crawlers, including ours | Permitted with restrictions |

**Named blocked bots** are specifically AI training data collectors: Common Crawl (CCBot — used to train GPT, LLaMA, etc.), ByteDance (Bytespider), Meta (FacebookBot, Meta-ExternalAgent), Cohere training crawlers, and dataset-building tools (img2dataset, Diffbot, PetalBot). The site is explicitly refusing to feed AI training pipelines.

**`Content-signal: search=yes,ai-train=no`** is a non-standard directive from the emerging [AI Preferences Spec](https://www.ietf.org/archive/id/draft-http-ai-data-preferences-00.html). It signals that the site consents to search indexing but not AI model training. Our use case — answering user queries about housing — is a **search/retrieval** application, not model training. We read the content at query time to answer specific user questions; we do not use it to update model weights. This falls on the permitted side of the `search=yes` signal.

**`Crawl-delay: 10`** — 10 seconds between requests. Our current scraper already respects a delay; needs to be confirmed at 10 s or greater.

**Disallowed paths** (`/cdn-cgi/`, `/backend/`, `/modules/`) — none overlap with `/properties` or `/properties/search/<token>`, which is the actual landed URL after redirect. Both paths are permitted.

**Our User-Agent** (`uiuc-housing-assistant/1.0 (sz94@illinois.edu)`) does not match any of the 33 named blocked bots, so the `User-agent: *` block applies. Verdict: ✅ **permitted**, subject to 10 s crawl delay.

---

## Source pages & field availability

> `greenstrealty.com` shares a single [robots.txt](https://www.greenstrealty.com/robots.txt) (`Crawl-delay: 10` respected).
> Detail page URL format confirmed: `/properties/profile/<slug>` (not `/properties/<slug>/`).
> **Redirect note:** Navigating to `/properties` immediately redirects to `/properties/search/<session-token>` (token is unique per session). Playwright follows this redirect automatically. The landed path is still outside all `Disallow` rules in `robots.txt`, so the ✅ permitted verdict holds.

| Field | `/properties` → `/properties/search/<token>` (main listing page) | `/properties/profile/<slug>` (detail page) |
|---|---|---|
| **Scope** | All properties, single page | Individual property |
| **robots.txt** | ✅ Permitted (delay 10 s) | ✅ Permitted (delay 10 s) |
| `photo_url` | ✅ top-level `"img"` in `property-info-json` → `https://www.greenstrealty.com/image/{img}/1800` | ❌ not needed — detail page photos are interiors |
| `description` | ❌ | ✅ `div.pp-info-html` — paragraph + bullet list |
| `amenities` | ❌ | ✅ `div.pp-amenities-data .pp-amenity-title` — structured tags |
| `availability_summary` | ❌ | ❌ **does not exist on GSR** |
| `subtitle` (tagline) | ✅ top-level `"subtitle"` in `property-info-json` — e.g. `"$500 GIFT CARD SIGNING BONUS"` | — |
| `brochure_url` | ❌ | ✅ `div.pp-document-wrapper a[href^="/file/"]` → prepend domain; absent on some properties |
| `area` | ✅ `property_area` | — |
| `unit_type` | ✅ `fplans[].title` | — |
| `price_total` | ✅ `fplans[].total_price` | — |
| `price_per_bed` | ✅ `fplans[].price_per_bed` | — |
| `availability` | ✅ `fplans[].availability` | — |
| `baths` | ✅ `fplans[].baths` | — |
| `beds` | ✅ `fplans[].beds` | — |
| `sqft` | ✅ `fplans[].sqft` | — |
| `utility_fees` | ❌ | ✅ in `div.pp-info-html` prose — labeled `Utility fee: $55/bed` when present; extract via regex; absent on some properties |
| `lease_dates` | ❌ | ✅ in `div.pp-info-html` prose — labeled `Lease dates: Aug 21, 2026 – Jul 31, 2027` when present; extract via regex; absent on some properties |

---

## Detail page audit — `11-e-columbia` (2026-06-17)

Source: `https://www.greenstrealty.com/properties/profile/11-e-columbia`

### Photos

`<script id="prop-photos-json-302" type="application/json">` contains a JSON array:
```json
[
  {"src": "/image/17192/1800", "thumb": "/image/17192/300"},
  {"src": "/image/17201/1800", "thumb": "/image/17201/300"},
  ...
]
```
- The numeric suffix (`302`) is an internal property ID — select with `script[id^="prop-photos-json"]`.
- Paths are relative — prepend `https://www.greenstrealty.com`.
- `/1800` = large; `/300` = thumbnail. Use `/1800` for `photo_url`.
- Take the first entry as the representative exterior photo.

### Description + inline amenities

`div.pp-info-html` contains a paragraph followed by a `<ul>` bullet list:
```
The Quarters is a five-story residential building on the north side of Downtown Champaign...
• Secure Building
• Internet Included
• In-Unit Laundry
• Onsite and offsite leased parking available
• Walkable to Downtown Restaurants and nightlife
• Large floorplans
```
The `<li>` items mix amenities (Laundry, Internet) with marketing copy. Extract the whole block as a single `description` string — do not attempt to parse individual amenities out of prose.

### Structured amenities

`div.pp-amenities-data .pp-amenity-title` — one `<div>` per amenity with icon + label:
```
Parking Garage
```
Separate from the bullet list above and cleaner to parse. Collect as a comma-joined string: `"Parking Garage"`.

### Not found on detail page

| Field | Status |
|---|---|
| `availability_summary` | ❌ GSR has no property-level marketing banner equivalent |
| `tagline` | ❌ Same — no equivalent |
| `utility_fees` | ⚠️ Not present on `11-e-columbia` — see `105-e-armory-ave` audit below for labeled format |
| `lease_dates` | ⚠️ Not present on `11-e-columbia` — see `105-e-armory-ave` audit below for labeled format |

---

## Detail page audit — `105-e-armory-ave` (2026-06-17)

Source: `https://www.greenstrealty.com/properties/profile/105-e-armory-ave`

### Photos

All detail page slider photos are already present in the main listing page `property-info-json` blob:
- `img` field (`18725`) = cover/exterior photo shown on listing card → use this as `photo_url`
- `photos[]` array = all slider photos including exterior corners and interior unit shots
- No need to visit detail page for photos

### Description, lease_dates, utility_fees

`div.pp-info-html` contains a rich structured description with labeled sections:

```
Brand new construction for August 2026

3 & 4 beds receive a $500 gift card per unit!

• Plank flooring throughout
• High-end finishes
• Granite countertops
• Stainless steel appliances
• In-unit washer & dryer
• Spacious, modern layouts

Building Amenities
• Onsite fitness center
• Elevator access
• Prime campus location
• Parking options

Lease Information
• Lease dates: August 21, 2026 – July 31, 2027
• Utility fee: $55 per bed
  - Includes: water, internet, trash, recycling, UC Sanitary
```

Extract the entire block as `description`. Additionally extract with regex when the labeled format is present:
- `lease_dates`: match `Lease dates:\s*(.+)` → `"August 21, 2026 – July 31, 2027"`
- `utility_fees`: match `Utility fee:\s*(.+)` → `"$55 per bed"`

These fields are **property-dependent** — newer/updated listings tend to have them; older listings like `11-e-columbia` do not. Store `""` when absent.

### Structured amenities

`div.pp-amenities-data .pp-amenity-title` — not present on this property (empty or not rendered). Not all GSR properties have this section.

---

## Scraping strategy (updated after audit)

**Photo source correction:** the detail page photos (`/properties/profile/<slug>`) are interior unit photos, not building exteriors. The exterior cover photo is the top-level `"img"` field already present in the `property-info-json` blob on the main listing page. URL: `https://www.greenstrealty.com/image/{img}/1800`.

- **Step 1** (existing + photo): scrape `/properties/search/<token>` → extract all unit-level fields **and `photo_url`** from `property-info-json` blob; collect `prop_url` per property
- **Step 2** (new): for each unique `prop_url`, visit `/properties/profile/<slug>` → extract `description`, `amenities`, `lease_dates` (regex on `pp-info-html`), `utility_fees` (regex on `pp-info-html`); store `""` when absent
- Crawl delay: 10 s between all requests (both steps)
- `prop_url` is already captured by the existing scraper (`green_street.py` line 63)

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
| `photo_url` | `img` → `https://www.greenstrealty.com/image/{img}/1800` |
| `subtitle` | `subtitle` |

---

## How to run

**Scale:** 254 unique properties × 10 s crawl delay ≈ 43 min for detail pages. Add ~1 min for the main listing page. Total: ~45 min.

```bash
# Step 1 — scrape (runs both main listing page + all detail pages)
python scrapers/green_street.py
# Output: data/green_street_raw.json

# Step 2 — retry any timeouts (identifies empty-description listings automatically)
python -m scripts.retry_failed_details
# Output: patches data/green_street_raw.json in place

# Step 3 — normalize + ingest into SQLite + Chroma
python -m pipeline.normalize
python -m pipeline.ingest
```

---

## Actual scraping results (2026-06-17)

Run: `python scrapers/green_street.py` + `python -m scripts.retry_failed_details`

| Metric | Value |
|--------|-------|
| Property cards on main listing page | 254 |
| Unique properties scraped | 252 (2 had no floor plans) |
| Floor plan listings saved | 494 |
| Original timeouts (main run) | 5 |
| Still failing after 60 s retry | 1 (`1001-s-pine` — page loads but content is empty) |

**Field coverage after retry:**

| Field | Count | % | Notes |
|-------|-------|---|-------|
| `description` | 470 / 494 | 95% | 23 properties have no description on GSR website |
| `amenities` | 48 / 494 | 10% | Structured amenity tags only on a minority of properties |
| `lease_dates` | 330 / 494 | 67% | Present when listing has confirmed lease dates |
| `utility_fees` | 311 / 494 | 63% | Present when utility fee is published |
| `brochure_url` | 147 / 494 | 30% | Brochure PDF linked on roughly a third of properties |

**Key finding — amenities coverage:** Only 10% of listings have structured `div.pp-amenities-data` tags. Most amenity information is embedded in the prose `description` field as bullet points, not in the structured section. If amenity-based search is a priority, the `description` text is the primary signal.

**Empty descriptions are a data quality issue on GSR's side**, not a scraper failure. 23 property URLs return a page with no `div.pp-info-html` content; `1001-s-pine` is additionally the only URL that hits a 60 s networkidle timeout.

## Pipeline results (2026-06-17)

Run: `python -m pipeline.normalize` → `python -m pipeline.ingest`

| Metric | Value |
|--------|-------|
| Total listings in snapshot | 883 (494 GSR + 389 UG) |
| Chroma — re-embedded | 353 (text field changed due to new amenities/lease/utility fields) |
| Chroma — metadata-only update | 514 |
| Chroma — new additions | 4 |
| Chroma — removed | 0 |

The 353 re-embeddings were triggered because `text` now includes `amenities`, `lease_dates`, and `utility_fees` where present, changing the document content for those listings.

---

## Checklist

- [x] Confirm detail page URL format: `/properties/profile/<slug>`
- [x] Audit detail page HTML — document all available fields and selectors
- [x] Confirm `photo_url` source: top-level `img` field in main listing `property-info-json` → `https://www.greenstrealty.com/image/{img}/1800`
- [x] Confirm `description` source: `div.pp-info-html`
- [x] Confirm `amenities` source: `div.pp-amenities-data .pp-amenity-title`
- [x] Confirm `lease_dates` source: regex on `div.pp-info-html` — `Lease dates:\s*(.+)`; absent on some properties
- [x] Confirm `utility_fees` source: regex on `div.pp-info-html` — `Utility fee:\s*(.+)`; absent on some properties
- [x] Confirm `availability_summary` does not exist on GSR; `subtitle` is GSR's tagline equivalent (in main listing JSON)
- [x] Confirm `brochure_url` source: `div.pp-document-wrapper a[href^="/file/"]` on detail page; absent on some properties
- [x] Add `description`, `amenities`, `lease_dates`, `utility_fees`, `subtitle`, `brochure_url` columns to SQLite schema (`normalize.py`)
- [x] Update `scrapers/green_street.py`: extract `subtitle` from main listing JSON; add detail-page loop to fetch `description`, `amenities`, `lease_dates`, `utility_fees`, `brochure_url`
- [x] Update `pipeline/ingest.py` and `frontend/lib/api.ts` with new fields
- [x] Run pipeline: `normalize` → `geocode` → `ingest`
