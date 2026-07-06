# Phase 9 — Expanded Company Coverage

## Goal

Add scrapers for additional Champaign-Urbana housing companies to broaden listing coverage beyond the current Green Street Realty and Universities Group.

---

## Target companies

| Company | Notes |
|---|---|
| MHM | ✅ Scraper done — see [Phase 9.2](phase-9.2-mhm-scraper.md). WordPress property pages via requests + BS4, 10s crawl-delay per robots.txt. Legality checked first (robots.txt allows all, no ToS). |
| Dean | ⛔ Skipped (2026-07-05) after legality check. The Dean Campustown (thedean.com/campustown/, GMH Communities): no robots.txt, but its Terms & Conditions restrict the site to personal noncommercial use and prohibit copying/distributing/publishing "any information obtained from this website" — incompatible with republishing listings in this product. Revisit only with written permission from GMH. |
| Campus Town | ✅ Already covered — no scraper needed (2026-07-05). Campustown Rentals / the Academy Campustown portfolio (4 properties: 908 S First, 1008 S Fourth, 501 S Sixth, 307 E Daniel; 171 units, 398 beds) was acquired by Green Street Realty in May 2026; campustownrentals.com now redirects to greenstrealty.com, and all 4 addresses are confirmed present in `data/green_street_raw.json` via the existing GSR scraper. |
| Hub | ⛔ Skipped (2026-07-05) after legality check. Hub on Campus Champaign (huboncampus.com/champaign/, Core Spaces): robots.txt is empty (allows crawling), but the Core Spaces Terms & Conditions explicitly prohibit "any robot, spider, scraper or other automated means... to access the Service or extract data", automated queries, and republishing/making content available to third parties. Stronger prohibition than The Dean's. Revisit only with written permission from Core Spaces. |
| Smile | ✅ Scraper done — see [Phase 9.1](phase-9.1-smile-scraper.md). Requests-only via the site's AppFolio JSON feed; no Playwright. Logo + FilterPanel registered. |
| Bankier (added 2026-07-05, not in original list) | ✅ Scraper done — see [Phase 9.4](phase-9.4-bankier-scraper.md). Main-site propertysearch admin-ajax endpoint (permissive robots, no ToS); property × bed-count granularity with coords included. The 13 per-building microsites are behind a Cloudflare managed challenge and are never requested — we link to them, not scrape them. |
| ICON (checked 2026-07-05) | ✅ Already covered — GSR manages it (office phone is GSR's); 309 E Springfield Ave is in `data/green_street_raw.json`. No action. |
| VUE (checked 2026-07-05) | ✅ Already covered — a GSR community (listed on greenstrealty.com); 711 S Fourth St is in `data/green_street_raw.json`. No action. |
| Campus Circle (checked 2026-07-05) | ⛔ Skipped. campuscircleapartments.com serves a sitewide Cloudflare JS challenge ("Just a moment...") to automated clients — we can't even read their ToS programmatically, and we don't bypass bot-detection. Revisit only with permission. |
| Latitude (checked 2026-07-05) | ⛔ Skipped. livelatitude.com: robots.txt allows, but the site serves a sitewide Cloudflare JS challenge to automated clients. Same boundary as Campus Circle and the Bankier microsites. |
| Octave | ✅ Scraper done — see [Phase 9.7](phase-9.7-octave-scraper.md). Single Asset Living high-rise; one-page fetch of server-rendered jet-portfolio cards, per-bed pricing with strikethrough discounts handled. Legality: robots allows, no ToS, operator privacy clean. Logo file still needed for FilterPanel registration. |
| 309 Green (checked 2026-07-05) | ⛔ Skipped. American Campus Communities Terms of Use explicitly prohibit "bots, spiders, scrapers, web crawlers... or other automated devices", restrict the site to noncommercial personal use, and ban commercial exploitation of content. Revisit only with written permission from ACC. |
| Burnham 310 | ⏸ Deferred (2026-07-05) after deeper recon. The main site cleared legality (robots fine, no ToS, operator privacy clean), but its floor-plans page carries **no pricing or availability** — the $ figure seen in the first pass was an Instagram-feed caption. All real data lives on entrata.burnham310.com, which serves a Cloudflare managed challenge ("Just a moment...") to automated clients, and we don't bypass bot-detection. A structural-only scrape (9 floorplans, no prices, no availability) isn't worth carrying, same reasoning as JSM. Revisit if they move pricing onto the main site or grant permission. |
| The Linc (checked 2026-07-05) | ⛔ Skipped. Aspen Square Management Terms & Conditions restrict content to personal noncommercial use and explicitly prohibit republishing, dataset redistribution, and ML training uses. Revisit only with written permission from Aspen Square. |
| Roland Realty (added 2026-07-05) | ✅ Scraper done — see [Phase 9.6](phase-9.6-roland-scraper.md). Webflow site, ~345 unit cards over 14 server-paginated pages, aggregated to 101 floorplan records (price ranges) across 82 properties. Legality: robots allows (sitemap only), no ToS, template privacy policy. This batch also motivated the systemic `clean_address()` fix in `pipeline/geocode.py` (spell out 1st→First etc., strip .5 house numbers). |
| JSJ (added 2026-07-05) | ✅ Scraper done — see [Phase 9.5](phase-9.5-jsj-scraper.md). Duda + AppFolio clone of the Smile scraper (SiteAlias 42273af2); whole-unit rents; filtered to Champaign-Urbana-Savoy; 68 floorplan records from 54 properties with feed-provided coords. Logo file still needed for FilterPanel registration. |
| JSM (added 2026-07-05, not in original list) | ⏸ Deferred by choice, not legality. Legality check passed cleanly (stock Drupal robots.txt; no ToS exists; privacy statement has no anti-scraping, commercial-use, or bulk-request clauses). But JSM is fully leased for 2026-27: the unit search returns zero results and the 47 building pages (`/node/<id>`, enumerable from `/buildings`) show no prices, so a scrape today would add ~100+ records with no price and availability all Leased. The rate sheet is a Canva embed, not scrapeable. Decision: skip crawling for now; a note under the Map/Card filter bar (`FilterBar.tsx`) tells users why JSM is absent. Revisit when 2027-28 leasing opens (~Oct 2026) — note the available-units markup is unobservable until then, so the availability parser must be finished at that point. |
| 0707 | ✅ Scraper done — see [Phase 9.3](phase-9.3-seven07-scraper.md). Company is Seven07 (liveseven07.com, Cardinal Group), single building at 707 S 4th St. One-page fetch: the /floor-plans/ page server-renders the full Entrata dataset into a `:floor_plans` attribute. Legality checked first (robots.txt allows with 10s crawl-delay; no ToS published anywhere). |

---

## Process for each new company

1. **Legality check first** (standing rule, 2026-07-05): fetch `robots.txt` (honor Disallow + Crawl-delay), find and read any Terms of Service/Use for anti-scraping or republishing clauses, confirm the data is public. Surface findings before writing any scraper code; skip the company if terms prohibit (see Dean, Hub).
2. Inspect the site manually — check for bot protection (Incapsula, Cloudflare, etc.)
3. Determine scraping approach (Playwright vs. plain requests vs. API)
4. Output to `data/<company_slug>_raw.json` using the standard schema — `pipeline/normalize.py` picks it up automatically
5. Add the company logo to `frontend/public/logos/` and add one entry to `COMPANIES` in `frontend/lib/companies.ts` — FilterPanel, ListingCard, SummaryTable, MapView, and Sidebar all pick it up from there (plus a short-name entry in `lib/exportDom.ts`)

Priority order: GSR and UG improvements first (scraping already working); new companies after.

---

## Checklist

- [x] Research and implement new company scrapers — every target company resolved (2026-07-05): ~~Smile~~ ✅ [9.1](phase-9.1-smile-scraper.md), ~~MHM~~ ✅ [9.2](phase-9.2-mhm-scraper.md), ~~0707/Seven07~~ ✅ [9.3](phase-9.3-seven07-scraper.md), ~~Campus Town~~ ✅ covered via GSR acquisition, ~~Dean~~ ⛔ ToS, ~~Hub~~ ⛔ ToS
- [x] Add logos and FilterPanel entries for each new company (Smile, MHM, Seven07, Bankier — one entry each in `frontend/lib/companies.ts`; all views pick it up from there)
- [x] Run the legality check (robots.txt + ToS) before designing any new company's scraper — standing rule; see Phase 9.2/9.3 for the format. Dean and Hub can be revisited with written permission (GMH Communities / Core Spaces).
