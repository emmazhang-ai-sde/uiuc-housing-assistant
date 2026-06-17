# Phase 9 — Expanded Company Coverage

## Goal

Add scrapers for additional Champaign-Urbana housing companies to broaden listing coverage beyond the current Green Street Realty and Universities Group.

---

## Target companies

| Company | Notes |
|---|---|
| HMH | TBD |
| Dean | TBD |
| Campus Town | TBD |
| Hub | TBD |
| Smile | TBD |
| 0707 | TBD |

---

## Process for each new company

1. Inspect the site manually — check for bot protection (Incapsula, Cloudflare, etc.)
2. Determine scraping approach (Playwright vs. plain requests vs. API)
3. Output to `data/<company_slug>_raw.json` using the standard schema — `pipeline/normalize.py` picks it up automatically
4. Add company logo to `frontend/public/logos/` and register it in `COMPANY_LOGOS` in `ListingCard.tsx` and `SummaryTable.tsx`
5. Add the company as an option in `FilterPanel.tsx`

Priority order: GSR and UG improvements first (scraping already working); new companies after.

---

## Checklist

- [ ] Research and implement new company scrapers (HMH, Dean, Campus Town, Hub, Smile, 0707)
- [ ] Add logos and FilterPanel entries for each new company
