# Project Progress
*Last updated: May 21, 2026 · Day 2*

---

## 🏠 Project: UIUC Housing Search Assistant (AI-Powered RAG App)

### The Goal
An AI-powered housing search tool for UIUC students — users can ask in plain English (e.g., *"2BR under $900/month near Grainger"*) and get back real, ranked listings from Champaign landlords. Built as an original portfolio project to land an AI engineering job.

---

## Learning Foundation (from Xiaohongshu/RED)
Following a guide from blogger 我是瓦子 who used this approach to break into AI roles:
- **Week 1:** LangChain + local model (Ollama)
- **Week 2:** LangGraph + Agentic RAG
- **Key advice:** RAG is a must-know interview topic; build an original project, not a tutorial copy

Resources: AI Jason's videos on LangGraph and Agentic RAG

---

## Phase Status

| Phase | Status | Started | Completed | Notes |
|---|---|---|---|---|
| **Phase 1 — Local Model** | ✅ Complete | May 20 | May 20 | Ollama running, `llama3.1:8b` pulled, `chat.py` works |
| **Phase 2a — Data Layer** | ✅ Complete | May 20 | May 21 | Scraper, normalizer, `green_street_listings.db` |
| **Phase 2b — RAG Pipeline** | ✅ Complete | May 21 | May 21 | `ingest.py` → `chroma_db/` → `rag_chain.py` working |
| **Phase 2c — Streamlit Frontend** | ✅ Complete | May 21 | May 21 | `app.py` live at `localhost:8501` |
| **Phase 3 — Launch** | ⏳ Not started | — | — | Deploy to Railway/Render, swap Ollama → OpenAI API |

---

## File Map

```
ai/
├── .venv/                      # Python virtual environment (Python 3.14)
├── scrapers/
│   └── green_street.py         # ✅ Playwright scraper → green_street_raw.json
├── design_docs/                # Research notes and phase docs
├── chroma_db/                  # ✅ Persisted Chroma vector store
├── chat.py                     # ✅ Basic LangChain + Ollama smoke test
├── green_street_raw.json       # ✅ 489 floor plan listings from 251 properties
├── green_street_listings.db    # ✅ Normalized SQLite database (489 rows · 17 cols)
├── normalize_green_street.py   # ✅ Cleans raw JSON → SQLite
├── ingest.py                   # ✅ Embeds listings into Chroma
├── rag_chain.py                # ✅ Retriever + LLM chain
├── app.py                      # ✅ Streamlit chat UI
└── README.md                   # ✅ Project README
```

---

## Current Data: `green_street_raw.json`

- **489 floor plan listings** from **251 properties**
- Scraped from `greenstrealty.com/properties` via Playwright (headless Chromium)
- Robots.txt verdict: ✅ `/properties` not blocked; `Crawl-delay: 10` respected in scraper

**Price normalization:** ranges like `"875-900"` stored as `price_per_bed_low=875, price_per_bed_high=900` — both bounds preserved so the UI shows honest ranges and filters use the high column to avoid bait-and-switch.

---

## Immediate Next Step: Phase 3 — Launch

```bash
# What's needed before deploying:
# 1. Push to GitHub
# 2. Create a Railway / Render project
# 3. Swap ChatOllama → ChatOpenAI in rag_chain.py
# 4. Set OPENAI_API_KEY as an environment variable
# 5. Re-run ingest.py on the server with the production DB
```

See `phase-3-product-launch.md` for full deployment and distribution plan.

---

## Other Data Sources (planned scrapers)

| Company | robots.txt | Plan |
|---|---|---|
| **Green Street Realty** | ✅ Allowed | ✅ Done |
| **Universities Group** (ugroupcu.com) | ✅ No Disallow rules | Build scraper next |
| **MHM Properties** (mhmproperties.com) | ✅ No Disallow rules; `Crawl-delay: 10` | Build scraper later |
| Here 707 (here707.com) | ❓ Not yet checked | TBD |
| Hub on Campus (huboncampus.com) | ⚠️ No robots.txt | TBD |
| Campus Town / The Dean (thedean.com) | ⚠️ 404 on robots.txt | TBD |

---

## Environment Setup

```bash
# Activate the virtual environment (do this every new terminal)
source ~/Library/CloudStorage/OneDrive-Personal/ai/.venv/bin/activate

# Installed packages include:
# langchain, langchain-ollama, langchain-community, langchain-core,
# chromadb, sentence-transformers, streamlit, pandas,
# sqlite-utils, python-dotenv, playwright
```

Ollama is running via `brew services start ollama` (starts at login).
Model in use: `llama3.1:8b`

---

## Deployment Plan (Phase 3)

- Deploy to **Railway** or **Render** (free tier)
- Swap Ollama → **OpenAI API** for the live deployment
- Distribute via r/UIUC, UIUC Facebook groups, Discord servers
- Track query volume and failure cases for the resume story

**Resume framing:**
> *"Built an Agentic RAG application that aggregates UIUC housing listings from multiple sources and lets students search via natural language. Designed the retrieval pipeline with LangChain + Chroma, deployed on Railway, and launched to the UIUC student community."*

---

## Daily Log

### May 20 (Day 1)
- Researched LangChain, Ollama, and Agentic RAG concepts
- Set up Python virtual environment (`.venv`) and installed all packages
- Installed Ollama, pulled `llama3.1:8b`, verified with `chat.py` ✅
- Researched `robots.txt` for all 6 target landlord sites
- Built `scrapers/green_street.py` using Playwright (site blocks bare `requests` calls)
- Scraped greenstrealty.com → **489 floor plan listings from 251 properties** → `green_street_raw.json` ✅

### May 21 (Day 2)
- Wrote `progress.md` to track project state going forward
- Wrote `normalize_green_street.py` — price ranges stored as `(low, high)` pairs, 489 rows → `green_street_listings.db` ✅
- Installed **SQLite Viewer** VSCode extension to inspect `green_street_listings.db`
- Wrote `ingest.py` — embeds all 489 listings into Chroma → `chroma_db/` ✅
- Wrote `rag_chain.py` — retriever (k=6) + structured prompt with price range flagging ✅
- Wrote `app.py` — Streamlit chat UI with streaming, 🌽 / 🏠 avatars, suggested questions, full-width grouped comparison table ✅
- Wrote `README.md`
- **Phase 2 complete** ✅
