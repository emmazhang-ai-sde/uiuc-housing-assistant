# 🏠 UIUC Housing Assistant

A UIUC housing search tool for students who want one place to compare real listings from Champaign-Urbana landlords.

Filter by beds, price, availability, property type, source, and location. Browse the same dataset as cards or on a full-screen map, with prices, availability, photos, coordinates, and direct landlord links.

**Live at [uiuc-housing-ai.com](https://uiuc-housing-ai.com)**.

## What It Does

Most UIUC students search for housing on Apartments.com or Craigslist, where listings are often stale, mis-priced, or already rented. This tool goes directly to the source, scraping major Champaign-Urbana landlords and normalizing everything into one searchable listing dataset.

The current product focus is structured search over reliable data: filters, cards, map, availability windows, geocoding, and source links. Earlier Chat/RAG/Table experiments are archived; see [`design-docs/post-launch/archive/chat-rag-archive.md`](design-docs/post-launch/archive/chat-rag-archive.md).

## Demo

Two active views over the same dataset:

- **Card** (`/card`) — filter by beds, price, availability, property type, and source; browse a paginated grid of listing cards.
- **Map** (`/map`) — the same listings plotted on an interactive map, colored by availability, with walking/driving time badges to campus landmarks.

Archived routes:

- `/chat` redirects to `/card`
- `/table` redirects to `/card`

Access is gated behind Supabase authentication so listings stay limited to approved users.

## Architecture — Data Search Pipeline

The active system runs in four phases:

1. **Scrape** — one Playwright scraper per landlord writes `data/<company>_raw.json`.
2. **Normalize** — `pipeline.normalize` cleans all raw files into a dated SQLite snapshot.
3. **Geocode** — `pipeline.geocode` fills coordinates for new addresses and preserves previously verified coordinates.
4. **Serve** — FastAPI reads the latest snapshot and applies SQL filters for Card and Map views.

The old LangChain/Chroma/Groq RAG implementation remains in the repository as legacy code for now, but it is not the active product path.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Scraping** | Playwright (headless Chromium), stealth mode for bot-protected sites |
| **Database** | SQLite (versioned snapshots in `snapshots/`) |
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
├── rag/                         # Legacy Chat/RAG implementation, archived from product path
├── backend/
│   └── main.py                  # FastAPI — /api/listings, /api/status plus legacy RAG endpoints
├── frontend/                    # Next.js (React, TypeScript, Tailwind)
│   ├── app/
│   │   ├── card/                # Filter-driven browsing grid
│   │   ├── chat/                # Archived route; redirects to /card
│   │   ├── table/               # Archived route; redirects to /card
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
├── chroma_db/                    # Legacy Chroma vector store from archived RAG flow
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

Fill in Supabase project credentials. See `.env.example` for what each variable does. `GROQ_API_KEY` is only needed if you intentionally revive the archived RAG endpoints.

### 5. Install and start Ollama (optional, legacy RAG only)

```bash
brew install ollama
brew services start ollama
ollama pull llama3.1:8b
```

Set `LLM_PROVIDER=groq` or `LLM_PROVIDER=ollama` only when working on archived Chat/RAG behavior.


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

# Step 4 — Optional legacy Chroma update
python -m pipeline.ingest
# → chroma_db/  (only needed for archived RAG endpoints)
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

Snapshot as of 2026-08-05: **1,138 listings across 9 companies.**

| Company | Status | Listings |
|---|---|---|
| Green Street Realty | ✅ Live | 493 |
| Universities Group | ✅ Live | 380 |
| Roland Realty | ✅ Live | 101 |
| JSJ Property Management | ✅ Live | 46 |
| MHM Properties | ✅ Live | 37 |
| Smile Student Living | ✅ Live | 30 |
| Bankier Apartments | ✅ Live | 28 |
| Seven07 | ✅ Live | 12 |
| Octave | ✅ Live | 11 |

A few other Champaign-Urbana landlords (The Dean, Hub, 309 Green, The Linc, Campus Circle, Latitude, Burnham 310) are intentionally excluded — either their terms of service prohibit republishing listing data, or bot protection blocks automated access. These are shown as muted, unscrapable chips in the app rather than silently omitted, so students know they weren't forgotten.

All scrapers respect each site's `robots.txt` and `Crawl-delay` directive; legality is checked before a new scraper is built.


## Roadmap

- [x] Card / Map views over a unified listing dataset
- [x] Archive Chat/RAG and Table as non-primary product paths
- [x] Distance-to-campus context on the map
- [x] Expand beyond Green Street Realty to 9 scraped companies
- [x] Supabase authentication, restricted to `@illinois.edu`
- [x] Deploy to Railway (backend) + Vercel (frontend)
- [ ] Public launch (currently waitlist-gated at `/coming-soon`)
- [ ] Saved listings / favorites
- [ ] Fix `beds=0` mis-parsing for non-standard unit-type strings (e.g. `"6 Bed Townhouse"`)


## Acknowledgements

Learning path inspired by [瓦子's guide on Xiaohongshu](https://www.xiaohongshu.com/explore/69c9a6400000000023021345) on building production-minded portfolio projects.
