# Phase 2 — Core Product Build
Goal: Build an MVP housing search assistant with RAG that aggregates UIUC listings.

---

## Overview

| Sub-phase | What you build |
|---|---|
| **2a — Data Layer** | Scrape/collect listings → normalize → store in SQLite |
| **2b — RAG Pipeline** | Embed listings into Chroma → build retriever + LLM chain |
| **2c — Frontend** | Streamlit chat UI that ties everything together |

---

## Before You Start — Install New Dependencies

```bash
source ~/Library/CloudStorage/OneDrive-Personal/ai/.venv/bin/activate
pip install langchain-community chromadb sentence-transformers \ streamlit requests beautifulsoup4 pandas sqlite-utils python-dotenv
```

| Package | What it does |
|---|---|
| `chromadb` | Local vector database to store embeddings |
| `sentence-transformers` | Turns listing text into embedding vectors (free, local) |
| `streamlit` | Turns your Python script into a web UI in ~50 lines |
| `beautifulsoup4` + `requests` | Scrape listing pages |
| `pandas` + `sqlite-utils` | Store and query structured listing data |

> **✅ checkpoint:** ```Installing/ Successfully installed```

```bash
Installing collected packages: sqlite-fts4, pypika, mpmath, flatbuffers, durationpy, websockets, websocket-client, uvloop, tqdm, toml, threadpoolctl, tabulate, sympy, SQLAlchemy, soupsieve, smmap, six, shellingham, setuptools, safetensors, rpds-py, regex, python-multipart, pyproject_hooks, pygments, pybase64, pyarrow, protobuf, propcache, pluggy, pillow, overrides, opentelemetry-api, oauthlib, numpy, networkx, narwhals, mypy-extensions, multidict, mmh3, mdurl, marshmallow, MarkupSafe, joblib, itsdangerous, importlib-resources, httpx-sse, httptools, hf-xet, grpcio, fsspec, frozenlist, filelock, click, cachetools, blinker, bcrypt, attrs, annotated-doc, aiohappyeyeballs, yarl, watchfiles, uvicorn, typing-inspect, starlette, scipy, requests-oauthlib, referencing, python-dateutil, opentelemetry-semantic-conventions, opentelemetry-proto, onnxruntime, markdown-it-py, jinja2, googleapis-common-protos, gitdb, click-default-group, build, beautifulsoup4, aiosignal, torch, sqlite-utils, scikit-learn, rich, pydeck, pydantic-settings, pandas, opentelemetry-sdk, opentelemetry-exporter-otlp-proto-common, jsonschema-specifications, gitpython, dataclasses-json, aiohttp, typer, opentelemetry-exporter-otlp-proto-grpc, kubernetes, jsonschema, langchain-text-splitters, huggingface-hub, altair, tokenizers, streamlit, langchain-classic, transformers, langchain-community, chromadb, sentence-transformers
Successfully installed MarkupSafe-3.0.3 SQLAlchemy-2.0.49 aiohappyeyeballs-2.6.2 aiohttp-3.13.5 aiosignal-1.4.0 altair-6.1.0 annotated-doc-0.0.4 attrs-26.1.0 bcrypt-5.0.0 beautifulsoup4-4.14.3 blinker-1.9.0 build-1.5.0 cachetools-7.1.3 chromadb-1.5.9 click-8.4.0 click-default-group-1.2.4 dataclasses-json-0.6.7 durationpy-0.10 filelock-3.29.0 flatbuffers-25.12.19 frozenlist-1.8.0 fsspec-2026.4.0 gitdb-4.0.12 gitpython-3.1.50 googleapis-common-protos-1.75.0 grpcio-1.80.0 hf-xet-1.5.0 httptools-0.7.1 httpx-sse-0.4.3 huggingface-hub-1.16.1 importlib-resources-7.1.0 itsdangerous-2.2.0 jinja2-3.1.6 joblib-1.5.3 jsonschema-4.26.0 jsonschema-specifications-2025.9.1 kubernetes-36.0.0 langchain-classic-1.0.7 langchain-community-0.4.1 langchain-text-splitters-1.1.2 markdown-it-py-4.2.0 marshmallow-3.26.2 mdurl-0.1.2 mmh3-5.2.1 mpmath-1.3.0 multidict-6.7.1 mypy-extensions-1.1.0 narwhals-2.21.2 networkx-3.6.1 numpy-2.4.6 oauthlib-3.3.1 onnxruntime-1.26.0 opentelemetry-api-1.42.1 opentelemetry-exporter-otlp-proto-common-1.42.1 opentelemetry-exporter-otlp-proto-grpc-1.42.1 opentelemetry-proto-1.42.1 opentelemetry-sdk-1.42.1 opentelemetry-semantic-conventions-0.63b1 overrides-7.7.0 pandas-3.0.3 pillow-12.2.0 pluggy-1.6.0 propcache-0.5.2 protobuf-6.33.6 pyarrow-24.0.0 pybase64-1.4.3 pydantic-settings-2.14.1 pydeck-0.9.2 pygments-2.20.0 pypika-0.51.1 pyproject_hooks-1.2.0 python-dateutil-2.9.0.post0 python-multipart-0.0.29 referencing-0.37.0 regex-2026.5.9 requests-oauthlib-2.0.0 rich-15.0.0 rpds-py-0.30.0 safetensors-0.7.0 scikit-learn-1.8.0 scipy-1.17.1 sentence-transformers-5.5.1 setuptools-81.0.0 shellingham-1.5.4 six-1.17.0 smmap-5.0.3 soupsieve-2.8.3 sqlite-fts4-1.0.3 sqlite-utils-3.39 starlette-1.0.1 streamlit-1.57.0 sympy-1.14.0 tabulate-0.10.0 threadpoolctl-3.6.0 tokenizers-0.22.2 toml-0.10.2 torch-2.12.0 tqdm-4.67.3 transformers-5.9.0 typer-0.25.1 typing-inspect-0.9.0 uvicorn-0.47.0 uvloop-0.22.1 watchfiles-1.2.0 websocket-client-1.9.0 websockets-16.0 yarl-1.24.2
```
---

## Step 2a — Data Layer

Goal: Get real UIUC listings into a clean, structured format your RAG pipeline can read.

#### Step 2a.1 — Choose Your Data Sources
> 📌 See more detailed technical decision in `phase-2-data-layer-research.md`

#### Step 2a.2 — Write a Scraper

Before running the scraper, two setup steps are required:

1. **Install Playwright and its browser:**
   ```bash
   pip install playwright
   playwright install chromium
   ```

2. **Identify the CSS selectors** by inspecting the page in Chrome:
   - Go to `greenstrealty.com/properties`
   - Right-click a listing card → **Inspect**
   - Find the outer `<div>` wrapping the whole card → `TODO_LISTING_CARD_SELECTOR`
   - Click into the card and find the title, address, price, beds, baths, and link elements one by one
   - Each selector is the tag + class name, e.g. `"h2.property-title"` or `"span.price"`

   Once the selectors are confirmed, 
   - run `python scrapers/green_street.py` and 
   - check `green_street_raw.json` to verify the data looks right.

> **✅ checkpoint 2a.2:** `scrapers/green_street.py` — Playwright-based scraper, selectors resolved via Chrome DevTools, outputs `green_street_raw.json`

#### Step 2a.3 — Normalize the Data

> 📌 create `normalize.py` to clean up the raw data into a consistent schema:

```
load raw JSON file

for each listing:
    extract price as integer using regex (e.g. "$875/mo" → 875)
    extract bed count as integer using regex (e.g. "3BR" → 3)
    compose a text chunk for RAG embedding (title + price + meta + url)

connect to SQLite
create listings table (title, price, beds, url, raw_meta, text)
insert all normalized rows
print count
```

Run it: `python normalize.py`

> **✅ Checkpoint 2a.3:** You have **`green_street_listings.db`** with real listings. Open it with DB Browser for SQLite to verify the data looks right.

#### Step 2a.3.1 — Normalization for `green_street_raw.json` 

> 📌 create **`normalize_green_street.py`**

> ✅ Full pipeline, normalization decisions, and SQLite schema in **`phase-2-data-layer-research.md`** — Part 3.

---

## Step 2b — RAG Pipeline

Goal: **Embed** your listings into a **vector store** and wire up a **retriever + LLM.**

### Step 2b.1 — Embed Listings into Chroma

---
#### Chroma
- Chroma is a local vector database — it stores and searches embeddings (numerical representations of text).

Here's the role it plays in your pipeline:
```
listing text  →  embedding model  →  vector (list of numbers)    →  stored in Chroma
                (all-MiniLM-L6-v2)   e.g. [0.23, -0.11, 0.87...]
```
**When a user asks** "2BR under $900 near campus", **the same embedding model converts that query into a vector, and Chroma finds the listings whose vectors are closest (most semantically similar) to it** - even if the exact words don't match.

**Why not just use SQLite for search?**
SQLite can filter by exact values (beds = 2, price <= 900), but it can't understand meaning. A user
might type "cheap place close to Grainger" — SQLite has no idea what to do with that. Chroma does,
because it works on **semantic similarity** rather than keyword matching.

**Why local?**
Chroma persists to a folder on disk (chroma_db/). No server, no API key, no cost — it just runs on
your machine, which is why it fits your local-first dev setup alongside Ollama.

The short version: 
- **SQLite** stores your structured data (prices, beds, addresses). 
- **Chroma** stores the meaning of your listings, so the LLM can find relevant ones from a natural language question.

---
#### SQLite
SQLite is a lightweight database that stores data in a single file on your machine — in your case, `green_street_listings.db`.

Think of it as a spreadsheet but with superpowers:

```
green_street_listings.db
└── listings (table)
    ├── row 1: 105 E Armory Ave | 2 bed | $900 | Available Aug 2026 | ...
    ├── row 2: 105 E Armory Ave | 3 bed | $875 | Leased | ...
    ├── row 3: 210 E Armory Ave | 1 bed | $1650 | Available Aug 2026 | ...
    └── ... (489 rows total)
```
You query it with SQL:
```
SELECT * FROM listings WHERE beds = 2 AND price_per_bed_high <= 900
```
**Why not just use the JSON file?**
`green_street_raw.json` is fine for storage, but terrible for querying. To find all 2BR apartments
under $900, you'd have to load the entire file into memory and loop through it manually in Python.
SQLite lets you ask structured questions instantly.

**The short version:** 
- **JSON** is for storing raw data. 
- **SQLite** is for querying it efficiently.
```
green_street_raw.json  →  normalize_green_street.py  →  green_street_listings.db
        (raw storage)              (cleaning)                  (queryable table)
```

---

> 📌 Create **`ingest.py`**

> **✅ checkpoint 2b.1:** **`ingest.py`**

Run it: `python ingest.py` → creates a `chroma_db/` folder
```bash
(.venv) shuyangzhang@Shuyangs-MBP ai % python ingest.py
Loaded 489 listings from green_street_listings.db
/Users/shuyangzhang/Library/CloudStorage/OneDrive-Personal/ai/ingest.py:52: LangChainDeprecationWarning: The class `HuggingFaceEmbeddings` was deprecated in LangChain 0.2.2 and will be removed in 1.0. An updated version of the class exists in the `langchain-huggingface package and should be used instead. To use it run `pip install -U `langchain-huggingface` and import as `from `langchain_huggingface import HuggingFaceEmbeddings``.
  embeddings = HuggingFaceEmbeddings(model_name=EMBED_MODEL)
modules.json: 100%|██████████████████████████████████████████████████████████| 349/349 [00:00<00:00, 1.74MB/s]
Warning: You are sending unauthenticated requests to the HF Hub. Please set a HF_TOKEN to enable higher rate limits and faster downloads.
config_sentence_transformers.json: 100%|██████████████████████████████████████| 116/116 [00:00<00:00, 670kB/s]
README.md: 100%|█████████████████████████████████████████████████████████| 10.5k/10.5k [00:00<00:00, 22.8MB/s]
sentence_bert_config.json: 100%|████████████████████████████████████████████| 53.0/53.0 [00:00<00:00, 193kB/s]
config.json: 100%|███████████████████████████████████████████████████████████| 612/612 [00:00<00:00, 2.91MB/s]
model.safetensors: 100%|█████████████████████████████████████████████████| 90.9M/90.9M [00:02<00:00, 35.3MB/s]
Loading weights: 100%|███████████████████████████████████████████████████| 103/103 [00:00<00:00, 16658.83it/s]
tokenizer_config.json: 100%|█████████████████████████████████████████████████| 350/350 [00:00<00:00, 1.88MB/s]
vocab.txt: 100%|███████████████████████████████████████████████████████████| 232k/232k [00:00<00:00, 4.71MB/s]
tokenizer.json: 100%|██████████████████████████████████████████████████████| 466k/466k [00:00<00:00, 23.9MB/s]
special_tokens_map.json: 100%|████████████████████████████████████████████████| 112/112 [00:00<00:00, 228kB/s]
config.json: 100%|████████████████████████████████████████████████████████████| 190/190 [00:00<00:00, 900kB/s]
✅ Embedded 489 listings into Chroma → ./chroma_db

```
⚠️ **First run is slow** (~2–5 min) as it downloads the embedding model. Subsequent runs are instant.

**What's inside `chroma_db/`**

Chroma creates a `chroma.sqlite3` file (readable in SQLite Viewer) plus a subdirectory of 4 `.bin` files — the HNSW index, a binary data structure for fast similarity search. They store embedding vectors (~384 floats per listing) and are not human-readable.

| File | What it stores |
|---|---|
| `header.bin` | Index configuration (dimensions, distance metric) |
| `data_level0.bin` | The actual embedding vectors |
| `link_lists.bin` | Graph connections between vectors (for fast search) |
| `length.bin` | Node count metadata |

To inspect content, open `chroma_db/chroma.sqlite3` in SQLite Viewer, or run a quick similarity search in Python to verify retrieval works before moving to `rag_chain.py`.

---

### Step 2b.2 — Build the Retriever + Prompt

> 📌 Create **`rag_chain.py`**

Run it: `python rag_chain.py`

> **✅ Checkpoint 2b:** You type a housing query and get back a real answer citing actual listings.

---

## Step 2c — Streamlit Frontend

Goal: Wrap the RAG chain in a clean chat UI.

### Step 2c.1 — Create `app.py`

> 📌 Create **`app.py`**

Run it: ```streamlit run app.py```

Opens automatically at `http://localhost:8501` 🎉

> **✅ checkpoint 2c.1:** 
> - open `http://localhost:8501`, 
> - type "2 bedroom under $900 near campus", and 
> - get back real UIUC listings with prices and links.

---

## Final Phase 2 File Structure

```
ai/
├── .venv/               # virtual environment
├── scrapers/
│   ├── green_street.py
│   ├── universities_group.py
│   ├── here_707.py
│   ├── hub_champaign.py
│   ├── campus_town.py
│   └── gsm.py
├── scraper.py           # 2a.2 — fetches raw listings
├── normalize.py         # 2a.3 — cleans + stores to SQLite
├── listings_raw.json    # raw scraped data
├── green_street_listings.db          # structured SQLite database
├── ingest.py            # 2b.1 — embeds listings into Chroma
├── chroma_db/           # persisted vector store
├── rag_chain.py         # 2b.2 — retriever + LLM chain
├── refresh.py           # weekly scheduler (see Data Layer Deep Dive)
└── app.py               # 2c.1 — Streamlit chat UI
```

---

## Common Pitfalls

| Problem | Fix |
|---|---|
| Craigslist blocks scraper | Add `time.sleep(1)` between requests; rotate `User-Agent` |
| Chroma gives irrelevant results | Improve your `text` field in `normalize.py` — richer text = better retrieval |
| LLM makes up listings not in the DB | Tighten the prompt: *"Use ONLY the listings below"* |
| `streamlit` not found | Make sure your `.venv` is active before running |
| Slow embedding on every run | `ingest.py` only needs to run once — Chroma persists to disk |

---

**Next:** → `phase-3-product-launch.md`
