# AI Pipeline — Detailed Reference

**Created: 2026-06-19**

Full annotated diagrams for the RAG pipeline. For the high-level summary, see the README.

---

## LangChain Ecosystem

| Package | Role |
|---|---|
| `langchain-chroma` | Vector store wrapper — reads/writes Chroma |
| `langchain-huggingface` | Local embedding model (`all-MiniLM-L6-v2`) |
| `langchain-groq` | Cloud LLM — Groq API (`llama-3.1-8b-instant`); production |
| `langchain-ollama` | Local LLM — Ollama (`llama3.1:8b`); local dev only |
| `langchain-core` | `PromptTemplate`, `StrOutputParser`, `Document`, `|` chain syntax |

---

## Phase 1 — Build the Knowledge Base (`pipeline/ingest.py`)

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA PIPELINE                            │
└─────────────────────────────────────────────────────────────────┘

  Landlord websites  ───►  scrapers/  ───►  pipeline/normalize_*.py
  (Playwright                                raw JSON ──► SQLite DB
   scraper)
                          │
                          │  sqlite3.connect()
                          ▼
                   ┌─────────────┐
                   │  SQLite DB  │   ~879 listings
                   │  listings   │   (address, beds,
                   │  table      │    price, url, lat/lng…)
                   └──────┬──────┘
                          │
                          │  LangChain Document()
                          ▼
                   ┌─────────────────────────────┐
                   │  LangChain Documents         │
                   │                             │
                   │  page_content: "2BR apt at  │
                   │  503 E White St, $875/bed…" │
                   │                             │
                   │  metadata: {beds:2,          │
                   │   price_low:875, url:…}      │
                   └──────────────┬──────────────┘
                                  │
                                  │  HuggingFaceEmbeddings
                                  │  all-MiniLM-L6-v2
                                  ▼
                   ┌─────────────────────────────┐
                   │  Embedding Model             │
                   │                             │
                   │  "2BR apt at 503 E White…"  │
                   │        │                    │
                   │        ▼                    │
                   │  [0.23, -0.41, 0.87, …]     │  ← 384-dim vector
                   │  (numerical meaning          │
                   │   fingerprint)               │
                   └──────────────┬──────────────┘
                                  │
                                  │  Chroma.add_documents()
                                  ▼
                   ┌─────────────────────────────┐
                   │       chroma_db/             │
                   │   (Chroma Vector Store)      │
                   │                             │
                   │   doc_1 → [0.23,-0.41,…]    │
                   │   doc_2 → [0.11, 0.67,…]    │
                   │   doc_3 → [-0.05,0.33,…]    │
                   │      … 879 vectors …         │
                   └─────────────────────────────┘
                        persisted to disk ✅
```

Ingest is **incremental**: unchanged listings are skipped; price/availability changes trigger a re-embed; metadata-only changes update in place without re-embedding.

---

## Phase 2 — Answer a Student's Question (`rag/rag_chain.py`)

```
┌─────────────────────────────────────────────────────────────────┐
│                        QUERY PIPELINE                           │
└─────────────────────────────────────────────────────────────────┘

  Student types in Next.js UI → POST /api/search → FastAPI
  ─────────────────────────────────────────────────────────
  "2BR under $900/bed near Grainger — what's available?"
          │
          ▼
  ┌──────────────────────────────────────────────────────────┐
  │  STEP 1 — LLM extracts structured filter params          │
  │                                                          │
  │  PromptTemplate | llm | StrOutputParser()                │
  │                                                          │
  │  Input:  natural language query                          │
  │  Output: {"beds": 2, "max_price_per_bed": 900,           │
  │           "available_only": true,                        │
  │           "location_hint": "Grainger"}                   │
  └───────────────────────────────────┬──────────────────────┘
                                      │
                                      ▼
  ┌──────────────────────────────────────────────────────────┐
  │  STEP 2 — Build Chroma where clause + metadata pre-filter│
  │                                                          │
  │  {"$and": [                                              │
  │    {"beds":              {"$eq":  2}},                   │
  │    {"price_per_bed_low": {"$lte": 1035}},  ← +15% flex  │
  │    {"is_available":      {"$eq":  true}}                 │
  │  ]}                                                      │
  │                                                          │
  │  Narrows ~879 listings to a smaller candidate pool       │
  │  before semantic search touches any vectors              │
  └───────────────────────────────────┬──────────────────────┘
                                      │
                                      ▼
  ┌──────────────────────────────────────────────────────────┐
  │  STEP 3 — Semantic similarity retrieval (k=50)           │
  │                                                          │
  │  Query embedded with same all-MiniLM-L6-v2 model        │
  │  similarity_search_with_relevance_scores() on candidate  │
  │  pool → top 50 → score gap trim (drop if score drops     │
  │  more than 0.5 from the top result)                      │
  └───────────────────────────────────┬──────────────────────┘
                                      │
                                      ▼
  ┌──────────────────────────────────────────────────────────┐
  │  STEP 4 — Proximity post-filter (location_hint)          │
  │                                                          │
  │  Haversine distance from each listing's lat/lng to the   │
  │  named landmark (e.g. Grainger @ 40.1125, -88.2269)      │
  │  Drop listings farther than 0.5 mi                       │
  │  Falls back to unfiltered if no listings have coords     │
  └───────────────────────────────────┬──────────────────────┘
                                      │
                                      ▼
  ┌──────────────────────────────────────────────────────────┐
  │  STEP 5 — LLM generates one-line summary                 │
  │                                                          │
  │  PromptTemplate | llm | StrOutputParser()                │
  │                                                          │
  │  Input:  first 5 listings + total count + filters        │
  │  Output: {"summary": "Found 8 available 2BR listings     │
  │           near Grainger, $820–$900/bed."}                │
  │                                                          │
  │  LLM does NOT select or rank listings — only summarizes  │
  └───────────────────────────────────┬──────────────────────┘
                                      │
                                      ▼
  FastAPI returns {answer, listings[]} → Next.js renders
  listing cards + sortable comparison table
```

---

## The LangChain Chain in One Line

Both LLM calls (Step 1 and Step 5) use the same LangChain pipe pattern:

```python
chain = PromptTemplate.from_template(PROMPT) | llm | StrOutputParser()
result = chain.invoke({"query": q, ...})
```

The `|` pipe operator passes the output of each component into the input of the next — the same composable pattern as Unix pipes.

---

## Key Design Decision — LLM Scope

The LLM is intentionally limited to two narrow tasks:

| Task | LLM does this |
|---|---|
| Parse natural language → JSON filters | Yes |
| Select which listings to return | **No** — Chroma metadata filter + semantic similarity |
| Rank listings | **No** — score gap algorithm |
| Write one-line summary | Yes |

This makes results deterministic and debuggable. The LLM cannot hallucinate listings that don't exist in the vector store.
