# Phase 9.7 — Octave Scraper

**Created: 2026-07-05**

> Scraper-specific notes and commands for Octave. Part of [Phase 9 — Expanded Company Coverage](phase-9-expanded-company-coverage.md); see [Phase 5.2 — Data Refresh Runbook](phase-5.2-data-refresh-runbook.md) for the full pipeline and shared raw-file/archive behavior.

## Legality check (done first, per the Phase 9 standing rule)

- `robots.txt`: allows everything except one WP-Optimize internals file. No crawl-delay.
- No Terms of Service exists (all standard URLs 404). The only legal link is Asset Living's privacy policy (they manage the building), which contains no anti-scraping, commercial-use, or bulk-request clauses.
- All data public, no login, no bot protection — the floor-plans page serves fully rendered to plain requests.

## Site shape

Octave is a single student high-rise at 210 S Fourth Street, Champaign (Asset Living-managed, 538 beds). The site is WordPress/Elementor, and `/floor-plans/` server-renders all 11 floorplans as `article.jet-portfolio__item` cards: `h3` title (A1…D4), a description block with "N Bed / N Bath", sqft, pricing, and a `span.floorplan-status` with either "Sold Out" or "N spaces remaining". One page fetch, requests-only.

## Data mapping decisions

**Prices are per bed.** The building leases by the space ("N *spaces* remaining", "Roommate Matching Available" is a listed feature), and 4BR/bed ($999–1,095) < 1BR ($sold out, historically higher) in the usual student-housing shape. A discounted floorplan renders the old price struck through (`<s>$1,065</s> $999`); the parser takes the **last non-struck price** as current. `price_total` = per-bed × beds. Multi-bed floorplans get `roommate_match = true`.

**Availability**: "Sold Out" → `Leased`; "N spaces remaining" → "Available (N spaces left)". The site gives no move-in dates.

**Address is constant** (210 S Fourth Street, Champaign) and goes through the normal Nominatim path — spot-check the pin after first ingest per Phase 5.3, since numbered streets have bitten before ("Fourth" is spelled out here, which is the safe form).

## Failure model

One HTTP request, all-or-nothing, no retry modes (same as Smile/Seven07).

## Commands

```bash
python scrapers/octave.py
python -m pipeline.normalize
python -m pipeline.geocode
python -m pipeline.ingest
```

## Rough timing

Seconds.
