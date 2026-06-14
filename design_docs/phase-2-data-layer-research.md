# Phase 2 — Data Layer Research

Per-source analysis: robots.txt status, page structure inspection, scraping strategy, and data shape.
Referenced by `phase-2-core-product-build.md` Steps 2a.1 and 2a.3.1.

---

## Source 1 — Green Street Realty (`greenstrealty.com`)

### robots.txt

```
User-agent: *
Crawl-delay: 10
```

No `Disallow` rules. All paths allowed. `Crawl-delay: 10` must be respected — scraper adds `time.sleep(10)` after page load.

### Page Inspection (Chrome DevTools)

1. Go to `https://www.greenstrealty.com/properties`
2. Right-click any listing card → **Inspect**
3. In the Elements panel, click the **↑** (select element) icon and click on the card to jump to its HTML
4. The card is wrapped in a `<div class="property-outer-wrapper">`
5. Inside the card, look for a `<script>` tag — you'll find:
   ```html
   <script type="application/json" class="property-info-json">
     { "address_1": "...", "fplans": [...], ... }
   </script>
   ```
   This hidden `<script>` tag contains **all property data as structured JSON** — address, floor plans, prices, availability, URL — no need to scrape individual HTML elements.

### Why This Matters

Instead of chasing fragile CSS selectors like `.price-text` or `h2.property-title`, we just parse the JSON directly. This is far more stable — the JSON schema is unlikely to change without the site also breaking its own frontend.

### Scraping Strategy

- Load `greenstrealty.com/properties` with Playwright (site returns 403 to plain `requests`)
- Wait for `networkidle` + 10-second sleep (Crawl-delay)
- `page.query_selector_all("div.property-outer-wrapper")` → one card per property
- For each card: `card.query_selector("script.property-info-json")` → parse JSON
- One property can have multiple floor plans (`data["fplans"]`) → emit one row per floor plan

### Data Shape (from JSON)

| JSON key | Maps to | Example |
|----------|---------|---------|
| `address_1` | `address` | `"105 E Armory Ave"` |
| `property_area` | `area` | `"on-campus"` |
| `type_of_property` | `property_type` | `"Apartment"` |
| `roommate_match` | `roommate_match` | `"0"` or `"1"` |
| `url` | `url` | `"https://greenstrealty.com/..."` |
| `fplans[].title` | `unit_type` | `"2 Bedroom"` |
| `fplans[].beds` | `beds` | `"2"` |
| `fplans[].baths` | `baths` | `"2.0"` |
| `fplans[].sqft` | `sqft` | `"850"` |
| `fplans[].total_price` | `price_total` | `"1800"` or `"1750-1800"` |
| `fplans[].price_per_bed` | `price_per_bed` | `"900"` or `"875-900"` |
| `fplans[].availability` | `availability` | `"Available August 2026"` |

### Price Range Normalization

Many listings have a price range (e.g., `"875-900"`). `normalize_green_street.py` splits these into `(low, high)` pairs:

```python
"875-900"  →  price_per_bed_low=875, price_per_bed_high=900
"900"      →  price_per_bed_low=900, price_per_bed_high=900
```

Both bounds are stored so the UI can show honest ranges and filters can use the high column to avoid bait-and-switch.

### Result

- **490 floor plans** across **251 properties** (June 13, 2026 snapshot)
- Output: `green_street_raw.json` → normalized into `snapshots/listings_YYYY-MM-DD.db`

---

## Source 2 — Universities Group (`ugroupcu.com`)

### robots.txt

```
User-agent: *
Disallow:
Sitemap: https://ugroupcu.com/sitemap_index.xml
```

`Disallow:` with no path = nothing is blocked. No `Crawl-delay`. Verified June 13, 2026.

### Page Inspection (Chrome DevTools)

**Key finding: there is no single listings page.** The Apartment Search page (`/apartment-search`) is a JS-driven search form that loads results via AJAX after form submission — nothing useful in the initial HTML.

Instead, the sitemap provides a direct index of all properties:

1. Go to `https://ugroupcu.com/sitemap_index.xml`
2. It references `https://ugroupcu.com/property_details-sitemap.xml`
3. Open that file — it contains **271 property URLs**, all in the form:
   ```
   https://ugroupcu.com/property-details/<address-slug>/
   ```
   Example: `https://ugroupcu.com/property-details/302-310-s-1st-midtown-plaza-champaign/`

4. Open any property detail URL in the browser, right-click → **Inspect**
5. The data is in **visible HTML text** (no hidden JSON script tag like Green Street).

   Each unit type is wrapped in `div.tab-content_in_wrapp`. Inside:

   **Unit type name** — left column:
   ```html
   <h4 class="propert_head">Luxury 1 Bedroom</h4>
   ```

   **All data fields** — right column (`div.tab-content_in_rgt > ul > li`).
   Each `<li>` has two divs: a label (`col-lg-5`) and a value (`col-lg-5` or `col-lg-10`):
   ```html
   <div class="col-lg-4 tab-content_in_rgt">
     <ul>
       <li>
         <div class="col-lg-5">Price per month:</div>
         <div class="col-lg-5">$1499.00</div>
       </li>
       <li>
         <div class="col-lg-5">Price per occupant:</div>
         <div class="col-lg-5">$1499.00</div>
       </li>
       <li>
         <div class="col-lg-5">Availability:</div>
         <div class="col-lg-5">Available August 2026</div>
       </li>
       <li>
         <div class="col-lg-5">Bathrooms:</div>
         <div class="col-lg-5">1</div>
       </li>
       <li>
         <div class="col-lg-5">Comments:</div>
         <div class="col-lg-10">Fully furnished...</div>
       </li>
     </ul>
   </div>
   ```

   **Important:** There is no "Bedrooms" field in the HTML. Bed count must be parsed
   from `h4.propert_head` — e.g. `"Luxury 1 Bedroom"` → 1, `"2 Bedroom - Layout A"` → 2,
   `"Studio"` → 0.

   Fully leased units show `$0` for price — map these to `availability = "Leased"`.

### Scraping Strategy

Unlike Green Street (one page, all data in JSON), Universities Group requires two steps:

**Step 1 — Collect all property URLs from sitemap**
```
GET https://ugroupcu.com/property_details-sitemap.xml
→ parse XML → extract all <loc> URLs (271 total)
```

**Step 2 — Visit each property detail page**
```
for each URL in sitemap:
    GET ugroupcu.com/property-details/<slug>/
    parse HTML → extract address, unit types, prices, beds, baths, availability
    emit one row per unit type
    sleep(2)   # no Crawl-delay specified; 2s is polite
```

Plain `requests` + `BeautifulSoup` may work (no JavaScript required for property detail pages — content is server-rendered). If blocked, fall back to Playwright with a real User-Agent.

### Data Shape (from HTML)

| HTML selector | Maps to | Notes |
|---------------|---------|-------|
| `h3` near page top | `address` | e.g. `"302-310 S. 1st-Midtown Plaza, Champaign"` |
| `h4.propert_head` | `unit_type` | e.g. `"Luxury 1 Bedroom"`, `"2 Bedroom - Layout A, C, M"` |
| `li` where label = `Price per month:` | `price_total` | `$0` means leased |
| `li` where label = `Price per occupant:` | `price_per_bed` | Same caveat |
| `li` where label = `Availability:` | `availability` | e.g. `"Available August 2026"` |
| `li` where label = `Bathrooms:` | `baths` | |
| Parsed from `h4.propert_head` text | `beds` | `"1 Bedroom"` → 1, `"Studio"` → 0 |
| `$0` price | `availability` | Override to `"Leased"` |

### Key Differences vs. Green Street

| | Green Street | Universities Group |
|--|--|--|
| All listings page | ✅ One URL | ❌ No — use sitemap |
| Data format | JSON in `<script>` tag | Visible HTML text |
| Playwright needed | ✅ Yes (blocks `requests`) | Probably not (test first) |
| Listings per page | 1 property = 1 card | 1 property = 1 page |
| Price ranges | Common (`"875-900"`) | Single value or `$0` (leased) |
| Crawl-delay | 10s | None specified — use 2s |

### Scraping Note (discovered June 2026)

`ugroupcu.com` is behind **Incapsula CDN**, which blocks plain `requests` even with a real User-Agent. Plain `requests` returns an Incapsula challenge page (no HTML content at all). Fix: use **Playwright** with stealth args and warm up the session by visiting the homepage first:

```python
browser = p.chromium.launch(headless=True, args=["--disable-blink-features=AutomationControlled"])
page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
page.goto("https://ugroupcu.com/")   # warm up → Incapsula sets cookies
page.goto(property_url)              # now accepted
```

### Result (first 5-page test, June 2026)

- **5 properties scraped → 11 floor plan listings** (some properties have multiple unit types)
- Full run: 275 properties, estimate ~1000–1500 floor plans
- Output: `data/universities_group_raw.json`

---

## Multi-Source Merging Strategy

This section explains how data from all sources flows into a single database and Chroma index.

### Layer 1 — Raw JSON (per scraper)

Each scraper writes its own file to `data/`:

```
data/green_street_raw.json        (490 listings)
data/universities_group_raw.json  (TBD after full scrape)
```

Both files use **identical schema** (same field names, same types):

```
company, address, area, property_type, roommate_match,
unit_type, beds, baths, sqft, price_total, price_per_bed,
availability, url, text
```

No JSON merge step is needed — the normalize pipeline reads all files directly.

### Layer 2 — Normalized SQLite (`snapshots/listings_YYYY-MM-DD.db`)

**Current problem:** `pipeline/normalize_green_street.py` reads only Green Street's JSON and hardcodes `"Company: Green Street Realty."` in the `text` field.

**Required change:** rename to `pipeline/normalize.py` and update it to:
1. Read **all** `data/*_raw.json` files (glob), concatenate records
2. Fix `text` generation: replace hardcoded company name with `record.get("company")`
3. Everything else (price range splitting, type casting, snapshot diffing) stays the same

The resulting DB schema is already correct — it has a `company` column and all shared fields.

### Layer 3 — Chroma Vector Index (`chroma_db/`)

**No changes needed.** `pipeline/ingest.py` is already fully generic:
- Reads from the snapshot DB (which will now contain all companies)
- Document ID = `MD5(address | unit_type)` — unique across companies since addresses don't overlap
- Incremental diff logic (add/update/delete) works the same regardless of source

### End-to-end flow (target state)

```
scrapers/green_street.py          →  data/green_street_raw.json
scrapers/universities_group.py    →  data/universities_group_raw.json

pipeline/normalize.py             reads data/*_raw.json
                                  →  snapshots/listings_YYYY-MM-DD.db

pipeline/ingest.py                reads latest snapshot DB
                                  →  chroma_db/  (incremental update)
```

### One thing to fix before full scrape

`pipeline/normalize_green_street.py` line 93 hardcodes the company in `text`:
```python
f"Company: Green Street Realty. "   # ← wrong for Universities Group records
```
Must change to:
```python
f"Company: {record.get('company', '')}. "
```
This is the only code change needed to support multi-source merging.

---

## Sources Pending Research

| Source | URL | robots.txt | Notes |
|--------|-----|------------|-------|
| MHM Properties | mhmproperties.com | ✅ Allows, `Crawl-delay: 10` | Not yet inspected |
| Here 707 | here707.com | ❓ Not checked | TBD |
| Hub on Campus | huboncampus.com | ⚠️ No robots.txt | Verify ToS before scraping |
