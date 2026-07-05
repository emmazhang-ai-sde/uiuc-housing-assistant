# Phase 5 — Scraper and Normalize Strategy

**Created: 2026-07-04**

Index for how listing data is scraped, versioned, and normalized into the search index. The detailed content lives in the sub-docs below; this page is just the entry point.

## Sub-docs

- **[Phase 5.1 — Snapshot Versioning & Incremental Chroma Updates](phase-5.1-snapshot-versioning.md)** — The original design and rationale. Why each scrape becomes a dated snapshot, why raw JSON is archived, and why Chroma is updated incrementally instead of rebuilt. Written when the pipeline scraped a single company; the mechanics still hold, but some script/module names in it are historical.

- **[Phase 5.2 — Data Refresh Runbook](phase-5.2-data-refresh-runbook.md)** — The current, operational how-to for the multi-company pipeline: the full pipeline order (scrape → normalize → geocode → ingest), shared raw-file/archive behavior, and how the two scrapers' strategies differ.

  - **[Phase 5.2.1 — Green Street Scraper](phase-5.2.1-green-street-scraper.md)** — Commands and modes for Green Street: default incremental fill, `--fresh`, and how partial failures are handled.

  - **[Phase 5.2.2 — Universities Group Scraper](phase-5.2.2-universities-group-scraper.md)** — Commands and modes for Universities Group: default full refresh (failures left as gaps, never backfilled), `--retry-missing` to fill just the gaps, and how a multi-pass session converges to one archived file.

- **[Phase 5.3 — Geocoding Manual Lookup](phase-5.3-geocoding-manual-lookup.md)** — Covers `pipeline/geocode.py`, the step that runs after normalize and before ingest. Documents the Nominatim failure modes that produce wildly wrong coordinates (county ambiguity, fraction-in-address parser crashes, em-dash marketing suffixes stripping the city name), the `MANUAL_COORDS` override table, and how to diagnose and fix a new bad geocode.

## Quick pointer

- Want to understand *why* the pipeline is built this way → Phase 5.1.
- Want to run the full pipeline end to end → Phase 5.2.
- Want the exact command to re-scrape just Green Street → Phase 5.2.1.
- Want the exact command to re-scrape just Universities Group → Phase 5.2.2.
- A map pin is showing up somewhere outside Champaign-Urbana → Phase 5.3.
