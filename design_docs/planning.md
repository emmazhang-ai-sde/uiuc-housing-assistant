# UIUC Housing Assistant — Planning Doc

> Written after Phase 2 completion (May 21, 2026).
> Update the Chunking Strategy and Retrieval Approach sections if the pipeline changes.
> Update the Documents table as new landlord scrapers are added.

---

## Domain

UIUC off-campus housing. Students searching for apartments in Champaign, IL face a fragmented market — each landlord has its own website with its own format, no central search exists, and listings go fast during peak signing season (January–March). This assistant aggregates real listings and lets students search in plain English instead of clicking through dozens of landlord pages.

---

## Documents

| # | Source | Description | Status |
|---|--------|-------------|--------|
| 1 | Green Street Realty (greenstrealty.com/properties) | 489 floor plans · 251 properties · scraped May 20, 2026 | ✅ Done |
| 2 | Universities Group (ugroupcu.com) | Large Champaign landlord, robots.txt allows crawling | Planned |
| 3 | MHM Properties (mhmproperties.com) | robots.txt allows, Crawl-delay: 10 | Planned |
| 4 | Here 707 (here707.com) | robots.txt status TBD | TBD |
| 5 | Hub on Campus (huboncampus.com) | No robots.txt — verify terms before scraping | TBD |

---

## Chunking Strategy

**Strategy:** Document-level — one LangChain `Document` per floor plan listing.

**Chunk size:** Each listing is a single pre-composed text blob built by `normalize_green_street.py`. No further splitting is applied.

**Overlap:** None — not applicable for document-level chunking.

**Reasoning:**

Housing listings are structured entities, not continuous prose. A listing's fields (address, price, bed count, availability) only make sense together — splitting them across chunks would break co-retrieval. A query for "2BR under $900/bed available in August" needs to match a single chunk that contains all three attributes simultaneously.

This makes document-level chunking the right choice, whereas the fixed-size character approach used in Lab 1 (300 chars, 50 overlap) is designed for rule books where any passage can independently answer a question.

When additional landlord sources are added, the `text` field format should be standardized across scrapers so embeddings remain comparable across sources.

---

## Retrieval Approach

**Embedding model:** `all-MiniLM-L6-v2` via `sentence-transformers`

Local model, no API key required, maps text to 384-dimensional vectors. Good performance on short structured passages. Accepted tradeoff: lower accuracy than cloud models (e.g., `text-embedding-3-large`) but zero cost and zero latency from network calls — appropriate for a local dev phase.

**Top-k:** 6

Retrieve 6 candidates so the LLM has enough listings to surface the best 3–5 matches. Too few candidates risks missing relevant listings when the vector search isn't perfectly precise; too many floods the context window and slows inference.

**Vector store:** ChromaDB (persistent, `./chroma_db`)

Ingested once via `ingest.py`; subsequent app starts load the existing index. Similarity metric: cosine distance.

**Relevance filtering:** `search_type="similarity_score_threshold"` with `score_threshold=0.3`

`K_RESULTS` is a ceiling, not a guarantee — results below the threshold are dropped before reaching the LLM. This prevents low-scoring listings from padding the context when a query has few strong matches. The threshold is tunable in `config.py`: increase it if irrelevant results still appear, decrease it if valid queries return nothing. Starting value of 0.3 is appropriate for `all-MiniLM-L6-v2` on structured listing text.

**Production tradeoff reflection:**

For Phase 3 deployment, the key upgrade is swapping `ChatOllama` for `ChatOpenAI` — the local Llama model isn't available on a cloud server. The embedding model can stay the same (it's fast and cheap to run). If query volume grows or domain-specific retrieval quality degrades, upgrading to `text-embedding-3-small` or a fine-tuned model would be the next lever. Multilingual support isn't needed for this domain.

---

## Evaluation Plan

Five test questions with specific expected answers. These are used to verify the pipeline after any significant change (new data source, model swap, prompt edit).

| # | Question | Expected answer |
|---|----------|-----------------|
| 1 | What 2BR apartments under $900/bed are available right now? | Returns only listings with `beds=2`, `price_per_bed_high <= 900`, availability not "Leased" |
| 2 | What is the cheapest 1-bedroom available near campus? | Returns the listing with the lowest `price_per_bed_low` among `beds=1`, available units |
| 3 | Show me all 4-bedroom options and their total monthly cost | Returns `beds=4` listings with total price calculated from per-bed price × 4 |
| 4 | What units are available for August 2026? | Returns listings where availability mentions August 2026 and filters out leased units |
| 5 | I have a $700/bed budget, what are my options? | Returns only listings where `price_per_bed_high <= 700`; acknowledges honestly if none found |

---

## Anticipated Challenges

1. **Price range ambiguity.** Many listings have a range (e.g., $875–$900/bed). If a student says "under $900/bed," a listing with `price_per_bed_high=900` technically meets the cutoff, but a listing with `price_per_bed_high=920` does not. The retriever doesn't filter by price — it retrieves by semantic similarity and passes all candidates to the LLM. The prompt instructs the model to flag listings where the high end exceeds the budget, but it relies on the model following the instruction consistently. A more robust fix would be metadata filtering in the retriever before the LLM sees the results.

2. **Stale listings.** The data was scraped on May 20, 2026. Availability changes daily during peak season. A listing shown as "available" may already be leased. Until there's an automated re-scrape schedule, the app should display the scrape date prominently and advise users to confirm availability directly with the landlord.

3. **Single data source.** With only Green Street Realty, the assistant can't answer "what are all my options near campus?" comprehensively. Queries that span landlords will silently return incomplete results. This improves as more scrapers are added, but must be documented in the UI until then.

---

## Architecture

```
Data Layer (run once or on re-scrape schedule)
─────────────────────────────────────────────
scrapers/green_street.py  ──►  green_street_raw.json
        │
        ▼
normalize_green_street.py  ──►  green_street_listings.db  (SQLite, 489 rows)
        │
        ▼
ingest.py
  - Loads rows from SQLite
  - Converts each row → LangChain Document (page_content = text blob, metadata = structured fields)
  - Embeds with all-MiniLM-L6-v2 (sentence-transformers)
  - Stores in ChromaDB  ──►  chroma_db/  (persistent)

Query Layer (runs on every user message)
────────────────────────────────────────
User question
        │
        ▼
retriever.invoke()  ──►  ChromaDB cosine similarity search (k=6)
        │
        ▼  (top-6 matching Documents)
rag_chain  ──►  PromptTemplate (grounding + format instructions)
        │
        ▼
ChatOllama / ChatOpenAI  (llama3.1:8b local · swap to OpenAI for Phase 3)
        │
        ▼
StrOutputParser  ──►  formatted listing response

UI Layer
────────
app.py  ──►  Streamlit chat interface
  - Suggestion buttons for common queries
  - render_summary(): grouped comparison table from retriever docs
  - LLM text response displayed in chat bubble
```

---

## Session Notes — June 7, 2026

**What was reviewed:** Lab 1 (RulesBot) and Project 1 starter were analyzed alongside this project to identify patterns worth adopting. The goal was to bring the UIUC Housing Assistant closer to an industrial-level RAG pipeline. Three main gaps were identified and addressed: missing `planning.md`, missing `requirements.txt`, and constants scattered across multiple files instead of a single `config.py`.

---

**Chunking strategy comparison — why document-level is the right choice here:**

Lab 1 uses fixed-size character-based chunking (300 chars, 50 overlap) because rule books are dense prose — any passage can independently answer a question like "What happens when you roll a 7?" The three strategies and where they apply:

| Strategy | Best for | This project |
|---|---|---|
| Fixed-size | Long prose, even density (rule books, articles) | ✗ — fragments listing fields |
| Recursive | Mixed structure, paragraph-heavy docs (FAQs, wikis) | ✗ — overkill for structured rows |
| **Document-level** | Structured entities where fields must stay together | ✓ — one Document per listing |

Housing listings are atomic units. A query for "2BR under $900/bed available in August" must match a single chunk that contains address, price, bed count, and availability simultaneously. Splitting a listing across chunks would silently destroy co-retrieval — the price might land in one chunk and the availability in another, and neither chunk alone would match the query correctly.

The listings arrive pre-composed from `normalize_green_street.py`, so no further splitting is needed or appropriate. When additional landlord sources are added, the `text` field format should be standardized across scrapers so embeddings remain comparable.

---

## Phase 3 — Deployment Checklist

- [ ] Push to GitHub (public repo)
- [ ] Create Railway / Render project
- [ ] Swap `ChatOllama` → `ChatOpenAI` in `rag_chain.py`
- [ ] Set `OPENAI_API_KEY` as environment variable on host
- [ ] Re-run `ingest.py` on the server with production DB
- [ ] Add scrape timestamp to sidebar so users know data freshness
- [ ] Fix bug: wire LLM chain response into Streamlit chat UI (see Action Items)
- [ ] Distribute: r/UIUC, UIUC Facebook groups, Discord servers
