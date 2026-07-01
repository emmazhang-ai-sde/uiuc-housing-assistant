# Property Type Classification

**Created: 2026-06-29**

## Background

Property listings are scraped from two sources: **Green Street Realty (GSR)** and **Universities Group (UG)**. These two sources handle `property_type` very differently:

- **GSR**: `property_type` is pulled directly from their API field `type_of_property`. Values are accurate and include `Apartment`, `House`, and `Single Family Home`.
- **UG**: `property_type` is hardcoded as `"Apartment"` in the scraper for every listing, regardless of actual building type. The only meaningful type signal comes from `unit_type` (the listing card title), e.g. `"TOWNHOUSE SPECIAL"`, `"6 Bed Townhouse"`, `"10 Bedroom House"`.

Because UG provides no real `property_type` signal, we infer it from `unit_type` during normalization.

---

## Classification Rules

Implemented in `pipeline/normalize.py` → `infer_property_type(unit_type, raw)`.

Rules are evaluated **in order**; the first match wins.

| Priority | Condition | Assigned `property_type` |
|----------|-----------|--------------------------|
| 1 | `unit_type` matches word boundary `\btownhouse\b` (case-insensitive) | `Townhouse` |
| 2 | `unit_type` matches word boundary `\bhouse\b` (case-insensitive) | `House` |
| 3 | `unit_type` starts with `N bed…` where N ≥ 5 | `House` |
| 4 | None of the above | Raw `property_type` from scraper (unchanged) |

**Townhouse and House are stored as separate types.** Rule 1 (townhouse keyword) wins over rule 2 (house keyword), so `"6 Bed Townhouse"` → `Townhouse`, not `House`. The frontend exposes them as distinct, mutually exclusive filter tabs (`Apartment / House / Townhouse`), and the backend filters on exact `property_type` match.

**Why word boundary (`\b`) for rules 1–2:** A naive substring match on `"house"` would incorrectly match `"Penthouse"`. The `\b` word boundary ensures only standalone occurrences of "house" or "townhouse" trigger the rule.

**Why N ≥ 5 for rule 3:** Units with 5+ bedrooms in the UIUC rental market are invariably houses or townhouses, not apartment units. This rule exists primarily to handle UG listings where the unit name is a bare bed count with no building-type keyword (e.g. `"6 Bedroom"`, `"16 Bedroom"`). Such bare-count units have **no signal distinguishing house from townhouse, so they default to `House`** — only an explicit `townhouse` keyword produces `Townhouse`. Verified against snapshot data: no genuine 5-bedroom apartments exist in the current dataset.

---

## Known Edge Cases and Decisions

| `unit_type` | Decision | Reason |
|-------------|----------|--------|
| `TOWNHOUSE SPECIAL` | → `Townhouse` | Contains "townhouse" |
| `6 Bed Townhouse` | → `Townhouse` | Contains "townhouse" (rule 1 wins over N ≥ 5) |
| `5 Bedroom Townhouse` | → `Townhouse` | Contains "townhouse" |
| `2 Br Townhouse` | → `Townhouse` | Contains "townhouse" |
| `2 Bedroom House` | → `House` | Contains "house" |
| `10 Bedroom House` | → `House` | Contains "house" |
| `5 Bedroom` / `6 Bedroom` / `8 Bedroom` / `16 Bedroom` | → `House` | N ≥ 5 rule; no keyword to disambiguate → defaults to House |
| `Penthouse Studio` / `3 Bedroom Penthouse` | → `Apartment` | "penthouse" contains "house" but no word boundary match; correctly excluded |
| `4 Bed (Townhome Layout)` | → `Apartment` | Contains "townhome" not "townhouse" or "house"; kept as scraped |
| `Luxury 2 Bedroom Townhome` | → `Apartment` | Same as above |
| `4 Bedroom` and below (no keyword) | → `Apartment` | N < 5; no keyword; kept as scraped |

---

## Affected Records (as of 2026-06-17 snapshot)

Records whose `property_type` is corrected by inference (all originally scraped as `"Apartment"` from UG):

| Address | `unit_type` | Rule | Corrected to |
|---------|-------------|------|--------------|
| 503 S. Locust, Champaign (×2) | TOWNHOUSE SPECIAL | `\btownhouse\b` | Townhouse |
| 1004 S First, Champaign | TOWNHOUSE SPECIAL | `\btownhouse\b` | Townhouse |
| 507 S. Locust, Champaign | 6 Bed Townhouse | `\btownhouse\b` | Townhouse |
| 507 S. Locust, Champaign | 5 Bedroom Townhouse | `\btownhouse\b` | Townhouse |
| 1727 Lincoln Road, Champaign | 2 Br Townhouse | `\btownhouse\b` | Townhouse |
| 604 E. White, Champaign | 2 Bedroom Townhouse | `\btownhouse\b` | Townhouse |
| 1017, 1019 W. John, Champaign | 2 Bedroom House | `\bhouse\b` | House |
| 101 E. Chalmers, Champaign | 10 Bedroom House | `\bhouse\b` | House |
| 707 S. First, Champaign | 6 bedroom | N ≥ 5 | House |
| 1005 S Oak, Champaign | 6 Bedroom | N ≥ 5 | House |
| 308 ½ E. Clark St, Champaign | 8 Bedroom | N ≥ 5 | House |
| 505 S. Second St, Champaign | 16 Bedroom | N ≥ 5 | House |

---

## Architecture Note

The `infer_property_type` function lives in `pipeline/normalize.py` rather than `scrapers/universities_group.py`. This is a known trade-off: ideally, company-specific inference logic would live in the company's own scraper so that `normalize.py` stays generic. However, given the small number of companies (target: ~9) and low total record count (~3,500 at full coverage), the added complexity of moving this logic was not considered worthwhile.

If a third company also produces unreliable `property_type` values, revisit whether a per-company pre-transform layer is warranted.

---

## Future Considerations

- If `"townhome"` appears as a `unit_type` keyword from a future company and is confirmed to mean the same as townhouse, add `"townhome"` to the rule 1 check (mapping it to `Townhouse`).
- The frontend `FilterPanel` and `MapFilterBar` Type buttons show `All / Apartment / House / Townhouse / Single Family` (label `Single Family`, value `Single Family Home`), mirroring the four stored values. The NL query parser in `rag/rag_chain.py` maps "townhouse"/"townhome" → `Townhouse`, "single family" → `Single Family Home`, and "house" → `House`; because the backend filters on exact match, an NL search for "house" returns only `House` records (not townhouses or single-family homes), consistent with the mutually exclusive tabs.
- GSR's `"Single Family Home"` value comes straight from its `type_of_property` API field (no inference). Only 1 record currently carries it; if that stays low, consider folding it into `House`.
