# Changelog

All notable changes to the UIUC Housing Assistant are recorded here.

---

## 2026-06-13 — Universities Group integration + multi-source data pipeline

### Added
- `scrapers/universities_group.py` — Playwright scraper for ugroupcu.com (275 properties via XML sitemap); uses stealth args + homepage warm-up to bypass Incapsula CDN; parses `div.tab-content_in_wrapp` blocks for unit type, price, beds, baths, availability
- `pipeline/normalize.py` — replaces `normalize_green_street.py`; reads all `data/*_raw.json` files and merges them into a single snapshot DB; supports any number of scrapers without code changes
- `data/` directory — centralised output folder for all scraper raw JSON files and the Green Street listings DB
- `design_docs/phase-2-data-layer-research.md` — added multi-source merging strategy section documenting the three-layer merge (JSON → SQLite → Chroma) and the one code fix required
- Company name now stored in Chroma metadata and returned by `POST /api/search`
- `ListingCard` — company name displayed above address; availability badge fix: "Not Available" / "Fully Leased" no longer matched as green
- `SummaryTable` — Company column added; Price/Month Total column removed; Price/Bed column is now the sole sortable price column

### Changed
- `pipeline/ingest.py` — `company` field added to Chroma metadata and `load_listings` query
- `pipeline/normalize.py` — company name in `text` field no longer hardcoded to "Green Street Realty"; uses `record.get("company")`
- `pipeline/normalize_green_street.py` — deleted; superseded by `pipeline/normalize.py`
- `scrapers/green_street.py` — output path updated to `data/green_street_raw.json`
- `frontend/lib/api.ts` — `company: string` added to `Listing` interface
- `frontend/.env.local` — `NEXT_PUBLIC_API_URL` corrected from `8001` to `8000`

### Data snapshot (2026-06-13)
- Green Street Realty: 490 floor plans
- Universities Group: 389 floor plans (275 properties)
- Combined: **879 listings**, 867 unique Chroma documents

### Added (earlier same day)
- `GET /api/status` endpoint — reads `snapshots/latest.txt` and queries the latest SQLite snapshot to return live listing count, property count, and last-scraped date
- Sidebar now fetches live data from `/api/status` on mount; replaced hardcoded listing counts and scrape date with dynamic values

### Changed (earlier same day)
- `backend/main.py` CORS `allow_methods` updated to include `GET` (previously `POST` only)

---

## 2026-06-13 — Phase 5: Snapshot Versioning & Incremental Chroma Updates

### Added
- `snapshots/` directory: each pipeline run produces `listings_YYYY-MM-DD.db` + `raw_YYYY-MM-DD.json`; `latest.txt` tracks the most recent date
- Fingerprint diff in `normalize_green_street.py` — skips writing a new snapshot if data is unchanged vs. the previous run
- Incremental Chroma updates in `pipeline/ingest.py` — computes stable IDs via `MD5(address|unit_type)`, applies only add/update/delete diffs; unchanged listings are not re-embedded
- `SNAPSHOTS_DIR` constant added to `config.py`; `DB_FILE` constant removed

### Changed
- `pipeline/normalize_green_street.py` — output path changed from a fixed `green_street_listings.db` to `snapshots/listings_YYYY-MM-DD.db`
- `pipeline/ingest.py` — reads DB path from `snapshots/latest.txt` instead of a hardcoded path

---

## 2026-06-07 — Phase 3: FastAPI + Next.js Migration

### Added
- `backend/main.py` — FastAPI app with `POST /api/search` endpoint
- `frontend/` — Next.js 15 app replacing Streamlit UI
  - `components/Sidebar.tsx` — collapsible sidebar with About section and Search Tips
  - `components/AssistantMessage.tsx` — renders listing cards + summary table; hides answer text when listings are present
  - `components/ListingCard.tsx` — per-listing card with price range, beds, availability badge
  - `components/SummaryTable.tsx` — sortable by Beds and Price/mo; default sort: price ascending, nulls last
  - `lib/api.ts` — typed `search()` function + `Listing` interface with `price_per_bed_low/high` and `price_total_low/high` as numeric fields
- `Procfile` — Railway deployment entry point (`uvicorn backend.main:app --host 0.0.0.0 --port $PORT`)
- `frontend/.env.local` — `NEXT_PUBLIC_API_URL=http://localhost:8001`

### Changed
- Project restructured: `rag/`, `pipeline/`, `scrapers/`, `backend/`, `frontend/` directories replacing flat layout
- `rag/rag_chain.py` — LLM now outputs JSON only (`{ listings, summary }`); `parse_json_output()` strips markdown fences
- `config.py` — cleaned up constants; legacy `DB_FILE` removed, `CHROMA_DIR` and `EMBED_MODEL` retained

### Kept
- `app.py` — legacy Streamlit UI retained for reference, not actively maintained

---

## 2026-05-22

### Changed
- README updated with project description and setup instructions

---

## 2026-05-21 — Phase 2: Core RAG Product

### Added
- `pipeline/normalize_green_street.py` — cleans raw JSON into SQLite; price ranges stored as `(low, high)` pairs
- `pipeline/ingest.py` — embeds all listings into Chroma vector store (`chroma_db/`)
- `rag/rag_chain.py` — LangChain retriever (k=6) + structured prompt; `RelativeThresholdRetriever` drops results more than `SCORE_GAP` below the top score
- `app.py` — Streamlit chat UI with suggested questions, 🌽/🏠 avatars, grouped comparison table

---

## 2026-05-20 — Phase 1: Local Model + Data Layer

### Added
- Python virtual environment (`.venv`, Python 3.14)
- Ollama installed locally; `llama3.1:8b` pulled
- `chat.py` — initial LangChain + Ollama smoke test
- `scrapers/green_street.py` — Playwright scraper targeting `<script class="property-info-json">` tags on greenstrealty.com; `Crawl-delay: 10` respected
- First scrape: **489 floor plans across 251 properties** → `green_street_raw.json`
- `config.py` — shared constants (`LLM_MODEL`, `EMBED_MODEL`, `CHROMA_DIR`)
