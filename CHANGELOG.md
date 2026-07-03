# Changelog

All notable changes to the UIUC Housing Assistant are recorded here.

---

## [Unreleased] — About page, Card view filter-driven browsing, Chat view docked detail panel, global Nunito Sans font

### Added
- `frontend/app/about/page.tsx` — new marketing/info page linked from the "UIUC Housing" logo in `AppHeader`: hero with a live listing-count stat line and the illustrated `public/logos/project-picture.png` banner; a two-scenario "what you can do here" section (Card/Map/Table view vs. Chat, each broken into bullet points); a "why it's better" grid (one search across companies, honest price-per-bed, plain-English search, live availability, map view, UIUC-students-only); a Before/Now table of pain points solved
- `backend/main.py` — `GET /api/listings` gained optional `page`/`page_size` query params: when provided, runs a `COUNT(*)` for `total` and applies `LIMIT`/`OFFSET`; results are now always ordered `(beds IS NULL) ASC, beds ASC, price_per_bed_low ASC` (existing unpaginated callers, e.g. the Map view, are unaffected other than gaining consistent ordering)
- `frontend/lib/api.ts` — `fetchListingsPage(filters, page, pageSize)`: paginated counterpart to `fetchAllListings`, returns `{ listings, total }`
- `frontend/components/FilterBar.tsx` — filter panel UI (Beds/Max-$/bed/Type/Availability/Source) extracted out of `MapFilterBar`; `MapFilterBar` is now a thin `absolute`-positioned wrapper around it, so the Map view and the Card view's filter column render from one shared implementation
- `frontend/components/ListingGrid.tsx` — shared `ListingCard` grid (`entries`, `filters`, `maxPricePerBed`, forwarded `ref`, required `columns: 3 | 4`) used by both the Card page (4 columns) and `AssistantMessage`'s cards view (3 columns, narrower now that Chat has a docked detail column)
- `frontend/components/PropertyPanel.tsx` — docked, always-visible counterpart to `PropertyDrawer` for the Chat page: reuses `PropertyDrawer`'s exported `DrawerContent`, shows a placeholder ("Select a listing to see its full details here") when nothing is selected, and the full property details in place when a card is clicked — no backdrop/modal, no click-to-open/click-to-close

### Changed
- Card page (`/`) rebuilt as a pure filter-driven browsing view: the old chat-thread/search-box UI is gone; the left column is `FilterBar`, the right side is a `ListingGrid` of all matching listings sorted by beds. With no filter active, results are paginated (24/page, Previous/Next) so all ~883 listings are never loaded at once; once any filter is applied, the (much smaller) result set loads in full for scrolling instead
- `frontend/components/ListingCard.tsx` — the `unit_type · beds · property_type` line is now three separate pill tags (no more inline `·` text); the beds-label and property-type tags are hidden individually when the active `filters` already pin that value for every card on screen (e.g. filtering to a single bed count hides the redundant "1 bed" tag), so only `unit_type` is guaranteed to always show
- Chat page (`/chat`) — filter toggle button and `FilterPanel` removed entirely (Chat now relies on the NL query parser rather than manual filters); layout changed to a fixed 3-column split (`ConversationSidebar` | conversation | `PropertyPanel`) instead of a `PropertyDrawer` modal overlay; `ChatWindow`'s empty state rewritten with copy specific to what Chat is for (talking through open-ended questions, remembers context) instead of the generic project pitch it shared with the Card page
- `frontend/app/layout.tsx` — global font switched from Geist Sans/Mono to Nunito Sans (`next/font/google`, applied via `nunitoSans.className` on `<body>`). The previous Geist setup only defined CSS variables that nothing referenced, so the whole app had silently been rendering in the browser's default system font
- `frontend/components/AppHeader.tsx` — "UIUC Housing" wordmark is now a `Link` to `/about`; tab list includes **Card** alongside **Chat**/**Map**

---

## [Unreleased] — Auth UI split, login branding, FilterPanel reflow, price-floor extraction fix

### Added
- `frontend/components/UserMenu.tsx` — user control in `AppHeader`: avatar + email/**Log out** dropdown when signed in, **Log In** link when signed out; reacts to `supabase.auth.onAuthStateChange`
- `frontend/app/login/page.tsx` — **Log In / Sign Up** segmented toggle. Sign Up keeps the beta-waitlist RPC check + `shouldCreateUser: true`; Log In skips the waitlist check, uses `shouldCreateUser: false`, and shows a "no account found — try Sign Up" fallback. Login card now shows the product logo (`frontend/public/logo.png`) and uses the **Nunito Sans** font (scoped to `/login` via `next/font/google`)

### Changed
- `frontend/components/FilterPanel.tsx` — responsive rewrite: `grid grid-cols-2` → `flex flex-wrap` with `min-w-0` on every row so pills wrap under their label instead of overlapping at narrow widths; columns stack below `min-w-[240px]`. Narrow-width stacking order is now Type → Beds → Max $/bed → Buffer → Availability → Source; all row labels unified to one width so the first option lines up across rows
- `frontend/components/AppHeader.tsx` — renders `<UserMenu />` right-aligned next to the Chat/Map tabs
- `frontend/app/login/page.tsx` — email step now leads with a "waiting-list only" notice. The waitlist email field is split into two mutually exclusive inputs stacked with an "or" divider: NetID → `@illinois.edu`, or username → `@gmail.com` (for beta testers who joined the waitlist with a personal Gmail before getting an Illinois email). Typing in one input disables the other until it's cleared, with a "Use only one" note above them. Log In helper copy now mentions the 8-digit one-time passcode

### Fixed
- `rag/rag_chain.py` — `extract_filters` mis-parsed price **floors**: "studios above $1,500" (and "over / more than $X") was dropped (→ "No limit") or inverted into a ceiling by the `>$1,500 → max_price_total` heuristic. Reworked the `EXTRACT_PROMPT` price section to decide floor-vs-ceiling from the wording first (floor words → `min_price_per_bed`; "above/over is always a floor, never a max field") + added worked examples. Verified: "above $1,500" → `min_price_per_bed: 1500` on all runs; ranges/ceilings/availability unchanged. Detail in `design-docs/agent/chat-pipeline-and-reliability-fixes.md` §4.6

---

## [Unreleased] — Map View Tab

### Added
- `backend/main.py` — `GET /api/listings`: queries SQLite directly (no LLM / vector search); supports `beds[]`, `max_price_per_bed`, `buffer_type`, `buffer_value`, `availability_window`, `company`, `property_type`, `penthouse` query params; returns full `Listing` shape matching frontend interface; availability mapped via SQL LIKE patterns; tested against 883-listing dataset
- `design-docs/map-view-tab/` — full feature spec: layout, filter bar design, implementation steps, test results, per-step change tables

---

## 2026-06-29 — Step 4: LangGraph Agent + Map/Table Export

### Added
- `rag/agent.py` — LangGraph-based agent: `create_agent` (LangChain 1.x) + `MemorySaver` checkpointer; `housing_search` tool decorated with `@tool(response_format="content_and_artifact")` returns `(str summary, list[dict] listings)`; `_summarize_listings()` injects real listing data so the LLM cannot hallucinate addresses or prices; system prompt instructs model to use tool data only
- `design-docs/agent/groq-tool-calling.md` — merged from two earlier drafts; documents the `<function=...>` XML format vs OpenAI JSON issue, root causes (wrong LangChain API + model training), the `create_agent` fix, and a model comparison table (8b ❌, 70b ✅ but 100k TPD exhausted, scout 17b ✅ current default); see doc for rate-limit table and fallback recommendations
- `frontend/lib/exportMap.ts` — `exportMapAsHtml()`: exports the current map state as a self-contained interactive HTML file; includes all listing markers (price pins, popup with photo/address/price/availability), landmark dots, Main Quad polygon, and a bed-type filter bar; filename follows `uiuc-housing-map-{slug}.html` convention
- Frontend: copy table + save table PNG + save map HTML actions moved to `AssistantMessage.tsx`; each view tab (Cards / Table / Map) now has its own export controls in the toolbar

### Changed
- `backend/main.py` `/chat` endpoint — replaced five-step RAG pipeline with `await agent.ainvoke()`; `thread_id` from `conversation_id` drives `MemorySaver` per-conversation isolation; listings extracted from first `ToolMessage` where `msg.name == "housing_search"` via `msg.artifact`
- `frontend/components/MapView.tsx` — converted to `forwardRef<MapViewHandle>`; `MapViewHandle.saveMapHtml()` imperative handle exposed to parent; accepts `filters: Filters` prop passed through to `exportMapAsHtml`; `mapRef` attached with `preserveDrawingBuffer: true`
- `frontend/components/SummaryTable.tsx` — converted to `forwardRef`; copy/save state and actions moved up to `AssistantMessage`; `tableRowsHtml` and `tableRowsTsv` exported for use in parent; accepts `filters: Filters` prop; table PNG filename follows `uiuc-housing-table-{slug}.png` slug convention
- `config.py` — `CHROMA_DIR` changed from `"./chroma_db"` (relative) to absolute path via `__file__` (matches `EMBED_MODEL`); prevents path resolution errors when uvicorn is started from a different working directory
- LLM selection: `/chat` agent uses `meta-llama/llama-4-scout-17b-16e-instruct` on Groq (`LLM_PROVIDER=groq`) or `ChatOllama(LLM_MODEL)` locally; `/api/search` continues to use `llama3.1:8b` for `extract_filters` + `summarize` (no tool calling required)

### Fixed (dev mode)
- `frontend/app/api/chat/route.ts` — auth check wrapped in `if (process.env.NODE_ENV !== "development")`; without this the chat endpoint returned 401 in local dev (no Supabase session)
- `frontend/app/api/conversations/route.ts` — GET returns `[]` in dev; POST returns `{ id: crypto.randomUUID() }` in dev, bypassing Supabase
- `frontend/app/api/conversations/[id]/messages/route.ts` — GET returns `[]` in dev; POST returns `{ id: crypto.randomUUID() }` in dev
- `frontend/hooks/useChat.ts` — `newConversation()`: `if (!data?.id) return` guards against undefined id entering state when API call fails; `sendMessage()`: wrapped in try/catch/finally — `setIsLoading(false)` now always fires in finally (previously an error would leave the chat permanently in loading state)
- `frontend/components/chat/ConversationSidebar.tsx` — `key={conv.id ?? i}` fallback prevents React key warning when `conv.id` is temporarily undefined after a failed POST

---

## 2026-06-28 — Design docs restructure + geocoding manual lookup doc + bad-geocode fixes

### Changed
- `design_docs/` + `design_docs-agent/` → merged into single `design-docs/` folder (hyphen, not underscore)
- Contents reorganised into three subdirectories:
  - `design-docs/agent/` — agent architecture docs (`agent-architecture.md`, `layer-1/2/3-*.md`)
  - `design-docs/agent-implementation-steps/` — `step-1` through `step-6`
  - `design-docs/ai-pipeline-implementation-phases/` — `phase-1` through `phase-9` + `ai-pipeline.md`
- Standalone docs (`competitive-analysis`, `filter-system`, `export`, `print-friendly-layout`, etc.) remain at `design-docs/` root

### Added
- `design-docs/geocoding-manual-lookup.md` — documents three Nominatim failure modes (Champaign County ambiguity, `1/2` fraction crash, em-dash suffix stripping city name); includes diagnosis commands, entry guidelines, full `MANUAL_COORDS` table, and unresolved bad-geocode list
- `pipeline/geocode.py` `MANUAL_COORDS`: added entries for `409 S 3rd` (misgeocoded to Fisher, IL), `56 1/2 E Green` (misgeocoded to Bulgaria), `60 E Green –` and `60 E. Green` (misgeocoded to Bloomington/Normal area)
- `snapshots/listings_2026-06-17.db` + ChromaDB: coordinates corrected for all four addresses above

---

## 2026-06-28 — Export PNG filename convention & image layout

- Frontend: structured filename slugs from filter state; per-image header bar — see [`frontend/CHANGELOG.md`](frontend/CHANGELOG.md)

---

## [Unreleased] — Customizable price buffer + UI polish round 2 + planning docs

> Not yet pushed. Date will be filled in (replacing this heading) at the next push/commit — see note in `feedback-changelog-dating.md` memory.

### Added
- `design_docs/phase-7-expanded-coverage.md` — Phase 7 renamed and refocused: map view, location-based search ("near Grainger") via landmark table + haversine distance, expanded property details (merged former UG floor-data feature in), new company scrapers
- `design_docs/product-launch.md` — deliberately has no phase number; covers building-in-public, Groq-based deployment, `@illinois.edu`-only auth, 50 queries/month cap with dataset-version-aware caching, and a security-constrained "Bring Your Own API" design
- `design_docs/future-ideas.md` — icebox doc for six longer-term concepts: sublet community, student reviews + Xiaohongshu scraping, saved properties folder, on-campus housing comparison for freshmen, academic-schedule-based proximity matching, UI visual overhaul
- `design_docs/competitive-analysis.md` — surveyed RentCollegePads (now a dead 404), Student.com, uhomes.com, STAN.ai; confirmed no existing tool combines NL search + UIUC-only verification + unbiased ranking
- Frontend: `companies.ts` extracted as shared module; filter bar, card grid (3-col), `ListingCard`, `SummaryTable` redesigned — see [`frontend/CHANGELOG.md`](frontend/CHANGELOG.md)

### Changed
- `design_docs/phase-7-product-launch.md` → split into `phase-7-expanded-coverage.md` (data/feature work) and a separate, phase-numberless `product-launch.md` (deployment/launch work); original phase-8 draft folded into the new product-launch doc

### Data snapshot (2026-06-13, re-verified)
- 879 floor plans (listings), 410 distinct properties — confirmed via direct snapshot DB query, matches `/api/status` and Sidebar display

---

## 2026-06-13 — Universities Group integration + multi-source data pipeline

### Added
- `scrapers/universities_group.py` — Playwright scraper for ugroupcu.com (275 properties via XML sitemap); uses stealth args + homepage warm-up to bypass Incapsula CDN; parses `div.tab-content_in_wrapp` blocks for unit type, price, beds, baths, availability
- `pipeline/normalize.py` — replaces `normalize_green_street.py`; reads all `data/*_raw.json` files and merges them into a single snapshot DB; supports any number of scrapers without code changes
- `data/` directory — centralised output folder for all scraper raw JSON files and the Green Street listings DB
- `design_docs/phase-2-data-layer-research.md` — added multi-source merging strategy section documenting the three-layer merge (JSON → SQLite → Chroma) and the one code fix required
- Company name now stored in Chroma metadata and returned by `POST /api/search`
- Frontend: company name in cards/table; availability badge fix; Sidebar shows live listing counts from `/api/status` — see [`frontend/CHANGELOG.md`](frontend/CHANGELOG.md)

### Changed
- `pipeline/ingest.py` — `company` field added to Chroma metadata and `load_listings` query
- `pipeline/normalize.py` — company name in `text` field no longer hardcoded to "Green Street Realty"; uses `record.get("company")`
- `pipeline/normalize_green_street.py` — deleted; superseded by `pipeline/normalize.py`
- `scrapers/green_street.py` — output path updated to `data/green_street_raw.json`

### Data snapshot (2026-06-13)
- Green Street Realty: 490 floor plans
- Universities Group: 389 floor plans (275 properties)
- Combined: **879 listings**, 867 unique Chroma documents

### Added (earlier same day)
- `GET /api/status` endpoint — reads `snapshots/latest.txt` and queries the latest SQLite snapshot to return live listing count, property count, and last-scraped date

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
- `frontend/` — Next.js 15 app replacing Streamlit UI: Sidebar, AssistantMessage, ListingCard, SummaryTable, typed API client — see [`frontend/CHANGELOG.md`](frontend/CHANGELOG.md)
- `Procfile` — Railway deployment entry point (`uvicorn backend.main:app --host 0.0.0.0 --port $PORT`)

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
