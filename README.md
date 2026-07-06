# 🏠 UIUC Housing Assistant

An AI-powered housing search tool for UIUC students. Browse by filter, ask in plain English, or drop pins on a map — get real, ranked listings from Champaign-Urbana landlords.

> *"2 bedroom under $900/bed near campus"* → instant results with prices, availability, and direct links, pulled from 9 property management companies.

**Live at [uiuc-housing-ai.com](https://uiuc-housing-ai.com)** — currently in waitlist mode ahead of public launch.

## What It Does

Most UIUC students search for housing on Apartments.com or Craigslist, where listings are often stale, mis-priced, or already rented. This tool goes directly to the source — scraping major Champaign-Urbana landlords — and gives students three ways to search: a filter-driven card grid, a conversational chat agent, and an interactive map.

Built as an original portfolio project to demonstrate production-ready AI engineering skills: RAG pipeline design, LLM tool-calling agents, web scraping at scale, and full-stack deployment with real user authentication.

## Demo

Three views over the same dataset:

- **Card** (`/card`) — filter by beds, price, availability, property type, and source; browse a paginated grid of listing cards.
- **Chat** (`/chat`) — a LangGraph agent that understands natural language ("studios above $1,500 near the Union"), remembers conversation context, and returns matching listings inline.
- **Map** (`/map`) — the same listings plotted on an interactive map, colored by availability, with walking/driving time badges to campus landmarks.

Access is gated behind Supabase authentication (`@illinois.edu` magic-link / one-time passcode) so listings stay limited to verified UIUC students.

## Architecture — RAG Pipeline

The system runs in two phases: **Build** (index listings into Chroma once) and **Query** (answer each student question).

### Query pipeline — 5 steps

1. **LLM extracts structured parameters** — `"2BR under $900 near Grainger"` → `{beds: 2, max_price_per_bed: 900, location_hint: "Grainger"}`
2. **Chroma metadata pre-filter** — narrow the candidate pool by exact criteria (price, beds, availability window) before touching vectors
3. **Semantic similarity retrieval** — embed the query with `all-MiniLM-L6-v2`; rank the filtered pool (k=50); trim off-topic results by score gap
4. **Proximity filter** — Haversine formula drops listings farther than 0.5 mi from the named landmark
5. **LLM generates summary** — retrieved listings are passed as context; LLM writes one sentence summarizing what was found

This is standard RAG: **Retrieve → Augment LLM context → Generate.**

The Chat view runs this through a **LangGraph tool-calling agent** (`rag/agent.py`) instead of a single-shot chain, so it can carry multi-turn conversation memory and decide when to actually run a search versus just answer conversationally. The Card and Map views skip the LLM entirely for browsing — they query SQLite directly (`GET /api/listings`) and only touch the RAG pipeline for the natural-language chat experience.

### AI tech stack

| Component | Technology |
|---|---|
| Vector database | ChromaDB — semantic search |
| Embedding model | `all-MiniLM-L6-v2` (HuggingFace Sentence Transformers, runs locally, bundled into Railway) |
| Structured output extraction | LLM parses natural language query into a JSON filter object |
| Hybrid retrieval | Vector similarity + metadata exact-match filter combined |
| Chat agent | LangGraph `create_agent` + tool-calling, Groq `llama-4-scout-17b-16e-instruct` |
| Filter extraction / summary LLM | Groq `llama-3.1-8b-instant` (prod) / Ollama `llama3.1:8b` (local dev) |
| RAG framework | LangChain (`langchain-chroma`, `langchain-huggingface`, `langchain-groq`, `langchain-ollama`) |

For annotated pipeline diagrams and LangChain LCEL chain details, see [`design-docs/ai-pipeline-implementation-phases/ai-pipeline.md`](design-docs/ai-pipeline-implementation-phases/ai-pipeline.md).

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Scraping** | Playwright (headless Chromium), stealth mode for bot-protected sites |
| **Database** | SQLite (versioned snapshots in `snapshots/`) |
| **Vector store** | ChromaDB, incrementally updated |
| **Backend** | FastAPI + Uvicorn |
| **Frontend** | Next.js 16 (React 19, TypeScript, Tailwind CSS 4) |
| **Auth** | Supabase Auth (magic link / OTP, `@illinois.edu`-restricted), JWT verified backend-side via ES256 JWKS |
| **Maps** | react-map-gl + MapLibre GL, OpenFreeMap tiles, OpenRouteService for walk/drive times |
| **Deployment** | Railway (backend) + Vercel (frontend) |
| **Language** | Python 3.14 / TypeScript |


## Project Structure

```
uiuc-housing-assistant-langchain-rag/
├── scrapers/                   # One Playwright scraper per company (green_street.py,
│                               #   universities_group.py, smile.py, mhm.py, seven07.py,
│                               #   bankier.py, jsj.py, roland.py, octave.py)
├── pipeline/
│   ├── normalize.py            # Reads all data/*_raw.json → merged snapshot DB
│   ├── geocode.py              # Batch geocodes addresses via Nominatim
│   └── ingest.py                # Incremental Chroma update (add/update/delete by stable ID)
├── rag/
│   ├── agent.py                 # LangGraph tool-calling agent for the Chat view
│   └── rag_chain.py             # extract_filters → build_where → retrieve → summarize
├── backend/
│   └── main.py                  # FastAPI — /api/search, /api/listings, /api/status, /chat
├── frontend/                    # Next.js (React, TypeScript, Tailwind)
│   ├── app/
│   │   ├── card/                # Filter-driven browsing grid
│   │   ├── chat/                # Conversational agent UI
│   │   ├── map/                 # Full-screen interactive map
│   │   ├── about/                # Marketing / product page
│   │   ├── account/              # Signed-in user account page
│   │   ├── login/                # Supabase auth (magic link / OTP)
│   │   └── coming-soon/          # Pre-launch waitlist page
│   ├── components/               # ListingGrid, ListingCard, MapView, FilterBar, AppHeader, ...
│   └── lib/                      # api.ts, companies.ts, landmarks.ts, availability.ts
├── snapshots/                    # Versioned SQLite snapshots + raw JSON archives
│   ├── latest.txt                # Points to most recent snapshot date
│   ├── listings_YYYY-MM-DD.db
│   └── raw_YYYY-MM-DD_<company>.json
├── chroma_db/                    # Chroma vector store (incremental, single directory)
├── config.py                     # Shared constants (model names, paths)
├── design-docs/                  # Phase design docs and architecture notes
└── scripts/                      # Maintainer-only tooling (e.g. bulk waitlist invites)
```


## Setup

### 1. Clone and create a virtual environment

```bash
git clone <your-repo-url>
cd uiuc-housing-assistant-langchain-rag
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install Python dependencies

```bash
pip install -r requirements.txt
playwright install chromium
```

### 3. Install Node.js dependencies (frontend)

```bash
cd frontend && npm install && cd ..
```

> **Note:** You only need to reinstall dependencies if you delete `.venv`, clone the repo to a new machine, or move the project to a different folder. For normal day-to-day use, just `source .venv/bin/activate` and skip straight to running the app.

### 4. Configure environment variables

```bash
cp .env.example .env
```

Fill in a `GROQ_API_KEY` (free tier) and Supabase project credentials. See `.env.example` for what each variable does.

### 5. Install and start Ollama (optional, local-only LLM)

```bash
brew install ollama
brew services start ollama
ollama pull llama3.1:8b
```

Set `LLM_PROVIDER=groq` (recommended, works locally and in production) or `LLM_PROVIDER=ollama` in your `.env`.


## Running the Pipeline

### Data pipeline (run once, then re-run whenever you want fresh listings)

```bash
# Step 1 — Scrape each company (repeat per scraper in scrapers/)
python scrapers/green_street.py
python scrapers/universities_group.py
# ... one run per company → data/<company>_raw.json

# Step 2 — Normalize and snapshot
python -m pipeline.normalize
# → snapshots/listings_YYYY-MM-DD.db  (skipped if data unchanged vs last snapshot)

# Step 3 — Geocode (only needed for new addresses)
python -m pipeline.geocode

# Step 4 — Incremental Chroma update
python -m pipeline.ingest
# → chroma_db/  (only adds/updates/deletes what changed)
```

### Launch the app (two terminals)

**Terminal 1 — Backend:**
```bash
source .venv/bin/activate
uvicorn backend.main:app --reload
# → http://localhost:8000
```

**Terminal 2 — Frontend:**
```bash
cd frontend && npm run dev
# → http://localhost:3000
```


## Data Sources

Snapshot as of 2026-07-05: **1,175 listings across 9 companies.**

| Company | Status | Listings |
|---|---|---|
| Green Street Realty | ✅ Live | 500 |
| Universities Group | ✅ Live | 381 |
| Roland Realty | ✅ Live | 101 |
| JSJ Property Management | ✅ Live | 68 |
| Smile Student Living | ✅ Live | 37 |
| MHM Properties | ✅ Live | 37 |
| Bankier Apartments | ✅ Live | 28 |
| Seven07 | ✅ Live | 12 |
| Octave | ✅ Live | 11 |

A few other Champaign-Urbana landlords (The Dean, Hub, 309 Green, The Linc, Campus Circle, Latitude, Burnham 310) are intentionally excluded — either their terms of service prohibit republishing listing data, or bot protection blocks automated access. These are shown as muted, unscrapable chips in the app rather than silently omitted, so students know they weren't forgotten.

All scrapers respect each site's `robots.txt` and `Crawl-delay` directive; legality is checked before a new scraper is built.


## Roadmap

- [x] Card / Chat / Map views over a unified listing dataset
- [x] Natural-language chat agent with multi-turn memory (LangGraph)
- [x] Distance-to-campus filter (proximity + walk/drive time)
- [x] Expand beyond Green Street Realty to 9 scraped companies
- [x] Supabase authentication, restricted to `@illinois.edu`
- [x] Deploy to Railway (backend) + Vercel (frontend)
- [ ] Public launch (currently waitlist-gated at `/coming-soon`)
- [ ] Per-user daily message quota on the chat agent
- [ ] Saved listings / favorites
- [ ] Fix `beds=0` mis-parsing for non-standard unit-type strings (e.g. `"6 Bed Townhouse"`)
- [ ] Bring-your-own-API-key support (Groq/OpenAI/etc.)


## Acknowledgements

Learning path inspired by [瓦子's guide on Xiaohongshu](https://www.xiaohongshu.com/explore/69c9a6400000000023021345) on breaking into AI engineering roles. RAG architecture based on AI Jason's LangGraph tutorials.
