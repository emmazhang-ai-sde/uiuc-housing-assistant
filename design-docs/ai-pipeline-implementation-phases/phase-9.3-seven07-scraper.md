# Phase 9.3 — Seven07 Scraper

**Created: 2026-07-05**

> Scraper-specific notes and commands for Seven07 (the "0707" entry in the Phase 9 target list). Part of [Phase 9 — Expanded Company Coverage](phase-9-expanded-company-coverage.md); see [Phase 5.2 — Data Refresh Runbook](phase-5.2-data-refresh-runbook.md) for the full pipeline (normalize/geocode/ingest) and shared raw-file/archive behavior.

## Legality check (done first, per the Phase 9 standing rule)

- `robots.txt`: allows everything except `/wp-admin/`, `Crawl-delay: 10` — crawling explicitly tolerated.
- No Terms of Use exists anywhere: liveseven07.com links only a privacy policy (on cardinalgroup.com), which *mentions* a "Terms of Use", but that document is not published at any discoverable URL (404 at every standard path). An unpublished term binds no one.
- All data is public, no login. Cloudflare fronts the site and rejects bare `curl`, but serves normal browser-header requests with a plain 200 (no JS challenge, no CAPTCHA) — the same UA etiquette every scraper in this repo already uses. If they ever escalate to real challenges, stop and reassess rather than bypass.

## Site shape

Seven07 is a single 27-story building at 707 S 4th St, Champaign (Campustown), managed by Cardinal Group. The site is WordPress (Agency FiftyThree theme) with a `floorplan` custom post type (12 floorplans). Pricing/availability data comes from Entrata, but the theme **server-renders the entire dataset into the `/floor-plans/` page** as a Vue component attribute: `:floor_plans='[...]'` — a JSON array with, per floorplan: title, bedrooms, bathrooms, `price_min`/`price_max`, `size_min`/`size_max`, `is_sold_out`, `first_available_date`, `available_units`, `lease_options` (per-term rents and start/end dates), gallery images, and special text. So the scraper is **one page fetch** — regex out the attribute, `html.unescape`, `json.loads`. No Entrata API calls, no Playwright, no per-floorplan page visits.

## Data mapping decisions

**Prices are per bed.** Rents decrease with bedroom count (4BR ≈ $1089–1169/bed vs studio $1649), and every lease option has `space_option: "Private"` — by-the-bed individual leases, standard for purpose-built student high-rises. So `price_per_bed` = `price_min`–`price_max` and `price_total` = price × beds (studio/1BR: both equal the rent). Multi-bed floorplans get `roommate_match = true` since bedrooms lease individually.

**Availability comes from `is_sold_out` + `first_available_date` + `available_units`.** Sold out → `Leased`. Otherwise `Available now` (when `first_available_date` ≤ today) or `Available <Month D, Year>`, with the live unit count appended (e.g. "Available now (1 unit left)"). Note `first_available_date` is an empty JSON array `[]` when sold out — the parser handles both shapes.

**Address is constant** ("707 S 4th St., Champaign") and geocodes through the normal Nominatim path; `MANUAL_COORDS` is the backstop if the numbered street trips one of the Phase 5.3 failure modes. `lease_dates` comes from the Annual lease option's start/end. `area` stays empty (the site names no neighborhood; we don't invent taxonomy). `tagline` carries `current_special_text` when present.

## Failure model

One HTTP request: the run either succeeds completely or writes nothing (same all-or-nothing model as Smile, Phase 9.1). No partial machinery, no retry modes.

## Commands

```bash
python scrapers/seven07.py
python -m pipeline.normalize
python -m pipeline.geocode   # one address; Nominatim or MANUAL_COORDS
python -m pipeline.ingest
```

## Rough timing

Seconds — a single page fetch.
