# Phase 8 — Expanded Property Details

## Goal

When a user clicks a building address, show an in-app detail drawer or modal with richer information than what currently lives in the listing cards. The direct link-out moves inside the drawer.

The guiding principle: **scrape whatever each company's website actually provides and include it.** Different companies publish different levels of detail — the schema is a superset; fields that a given company doesn't provide are simply left blank.

---

## Sub-phases

| Phase | Company | Status |
|---|---|---|
| [8.1](phase-8.1-ug-expanded-details.md) | Universities Group | 🔄 In progress — first run done, fixes pending |
| [8.2](phase-8.2-gsr-expanded-details.md) | Green Street Realty | ⬜ Not started — blob audit needed first |

---

## Scraping permissions

| Site | robots.txt | Verdict |
|---|---|---|
| ugroupcu.com | `Disallow:` (empty — all paths open) | ✅ Permitted |
| greenstrealty.com | `Crawl-delay: 10` respected | ✅ Permitted |

---

## Common fields (target for all companies)

| Field | Source | Status |
|---|---|---|
| Proximity to campus | Computed from geocoded coordinates (Phase 7) | ✅ Done |
| Campus area | Scraped (`area` field) | ✅ UG done, GSR done |
| Exterior photo | Scraped from listing index page | ✅ UG done |
| Availability summary | Scraped from listing index page | ✅ UG done |
| Amenities | Scraped from listing detail page | ⬜ Not yet |
| Bus line access | MTD GTFS cross-reference | ⬜ Not yet |
| Laundry | Scraped from listing detail page | ⬜ Not yet |
| Utility fees | Scraped from listing detail page | ⬜ Not yet |
| Lease dates | Scraped from listing detail page | ⬜ Not yet |

---

## Company-specific fields

| Field | Company | Status |
|---|---|---|
| Floor-level notes | Universities Group | ⬜ Not yet |
| Per-floor pricing | Universities Group | ⬜ Not yet |
| *(others TBD)* | GSR / new companies | To be discovered when auditing detail pages |

---

## Pipeline schema additions (all companies)

New columns added to SQLite `listings` table and Chroma metadata in this phase:

| Column | Type | Populated by |
|---|---|---|
| `photo_url` | TEXT | Scraper (company index page) |
| `availability_summary` | TEXT | Scraper (company index page) |
| `tagline` | TEXT | Scraper (company index page) |

GSR records leave these as `""` until Phase 8.2 is implemented.

---

## Pipeline re-run behavior

When only one company's raw JSON is updated, the three pipeline steps behave as follows:

| Step | Behavior | Cost |
|---|---|---|
| `normalize` | **Full rebuild** — drops and recreates the entire `listings` table from all `data/*_raw.json` files every run. No per-company mode. Before overwriting, reads geocoded `lat`/`lng` from the previous snapshot and restores them into the new DB — so geocode.py only sees truly new addresses. | Fast (pure JSON → SQLite, seconds regardless of size) |
| `geocode` | **Incremental** — queries `WHERE lat IS NULL` only; already-geocoded rows are skipped. Effective because normalize now preserves coords from the previous snapshot. | Only new/unknown addresses hit Nominatim; ~1.1 s delay applies only to them |
| `ingest` | **Incremental** — diffs existing Chroma IDs against the new snapshot; only adds, re-embeds, or removes changed listings. | Only changed/new/removed documents are touched |

**Practical implication:** updating UG data only and re-running all three steps is safe and efficient. `normalize` re-processes all companies but finishes in seconds; `geocode` and `ingest` automatically limit work to what actually changed.

---

## Frontend

Tracked in [`frontend/CHANGELOG.md`](../frontend/CHANGELOG.md).

---

## Checklist

- [x] Confirm scraping permissions for all target sites
- [x] Add `photo_url`, `availability_summary`, `tagline` to SQLite schema and Chroma metadata
- [x] Add new fields to `Listing` interface (`frontend/lib/api.ts`)
- [x] Phase 8.1 — UG scraper expanded (first run complete, fixes in progress)
- [ ] Phase 8.1 — UG scraper fixes: junk URL filter, context restart, crawl delay increase
- [ ] Phase 8.1 — UG re-run and pipeline (`normalize` → `geocode` → `ingest`)
- [ ] Phase 8.2 — Audit GSR detail pages; document all available fields
- [ ] Phase 8.2 — Expand GSR scraper (amenities, laundry, utilities, lease dates, photo)
- [ ] Frontend — build `DrawerPanel` component
