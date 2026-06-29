# Embedding Model Evaluation

**Created: 2026-06-17**

## Problem

The current model `all-MiniLM-L6-v2` has a **256-token sequence limit**. Text beyond that is silently truncated — the embedding only represents the first ~180 English words.

For short queries like _"1 bedroom under $900"_, this is fine. The problem is on the **document side**: the `text` field stored in Chroma is a concatenation of structured property facts — address, beds, price range, availability, amenities. As scrapers add more fields (Phase 8: `tagline`, `area`, `availability_summary`, amenity lists), this field grows. A typical listing with 8–10 amenities can exceed 256 tokens, meaning the amenity section — often the most semantically distinctive part of a listing — never gets embedded.

**Consequence in practice**: Queries like _"pet-friendly 2BR near campus"_ or _"utilities included studio"_ may return wrong results because the differentiating words were in the truncated tail.

---

## Verification — Is Truncation Actually Happening?

The truncation concern was validated against the live snapshot using [`scripts/check_token_lengths.py`](../scripts/check_token_lengths.py).

**Result (snapshot: 2026-06-17, 879 listings):**

| Metric | Value |
|--------|-------|
| Max token length | 135 |
| Median token length | 91 |
| Average token length | 90.9 |
| Listings exceeding 256 tokens | **0 / 879 (0%)** |

```
Token length distribution:
    0– 63:    0
   64–127:  878  ██████████████████████████████
  128–191:    1
  192–255:    0
  256+   :    0  ← no truncation occurring
```

**Conclusion**: The truncation problem described above does **not currently exist** in the data. The `text` field is much more concise than assumed — typical listings run 65–130 tokens, well under the 256-token limit. The original concern about amenity lists pushing listings over the limit is not borne out by the actual scraped data.

This reframes the model switch: switching to `bge-small-en-v1.5` is a **quality upgrade** (MTEB +9.7 points), not a bug fix. The urgency is lower, but the quality case stands.

---

## How Embedding Is Used in This Pipeline

```
User NL query
      │
      ▼
  HuggingFaceEmbeddings.embed_query(query)       ← query vector (short, always fits)
      │
      ▼
  Chroma.similarity_search_with_relevance_scores  ← cosine sim vs stored doc vectors
      │
      ▼
  Score-gap trim → final listings returned
```

Embedding runs in two places:
- **`pipeline/ingest.py` line 112** — embeds the `text` field of every listing when building/updating Chroma
- **`rag/rag_chain.py` line 27** — embeds the user's query at search time

Both use the same `EMBED_MODEL` constant from `config.py`. Changing the model requires rebuilding Chroma (vectors are dimension-specific and model-specific).

---

## Evaluation Criteria

Ordered by importance for this project:

| # | Criterion | Why it matters |
|---|-----------|----------------|
| 1 | **Token limit ≥ 512** | Core issue — must clear 256 to be worth switching |
| 2 | **MTEB Retrieval score** | Measures real retrieval quality on standard benchmarks |
| 3 | **Model size (RAM / disk)** | Portfolio project runs on laptop CPU — 500MB+ is noticeable |
| 4 | **Inference speed (CPU)** | Ingestion pipeline re-embeds all listings on full rebuild |
| 5 | **`langchain_huggingface` compatible** | Drop-in — just change `model_name` |
| 6 | **No API key / fully local** | Project philosophy: local-first |

---

## Candidate Models

All models are free, open-source, and work with `HuggingFaceEmbeddings(model_name=...)`.

| Model | Token Limit | MTEB Retrieval¹ | Size | Embedding Dim | Notes |
|-------|------------|-----------------|------|---------------|-------|
| `all-MiniLM-L6-v2` (**current**) | 256 | 41.95 | 80 MB | 384 | Truncates property descriptions |
| `all-MiniLM-L12-v2` | 256 | 43.69 | 120 MB | 384 | Deeper (12 layers) but same token limit — doesn't fix the problem |
| `all-mpnet-base-v2` | 384 | 43.81 | 420 MB | 768 | Marginal quality gain, 5× larger, still only 384 tokens |
| `thenlper/gte-small` | 512 | 49.46 | 67 MB | 384 | Fixes token limit, surprisingly small, solid retrieval |
| `BAAI/bge-small-en-v1.5` | 512 | 51.68 | 130 MB | 384 | **Recommended** — best quality/size ratio |
| `BAAI/bge-base-en-v1.5` | 512 | 53.25 | 430 MB | 768 | Better quality, but 3× larger than bge-small |
| `intfloat/e5-small-v2` | 512 | 49.04 | 130 MB | 384 | Comparable to bge-small, no clear advantage here |
| `BAAI/bge-large-en-v1.5` | 512 | 54.29 | 1.34 GB | 1024 | Best quality in this group, excessive for a laptop portfolio project |

¹ MTEB average retrieval score across BEIR benchmark datasets (higher = better). Source: [MTEB Leaderboard](https://huggingface.co/spaces/mteb/leaderboard), retrieval task subset.

---

## Analysis

### Why `all-MiniLM-L12-v2` and `all-mpnet-base-v2` are eliminated

Both have the same or worse token limits than the current model. `all-MiniLM-L12-v2` is 256 tokens — switching to it solves nothing. `all-mpnet-base-v2` is 384 tokens, which is better but still cuts off long listings; the quality gain over the current model is minimal (~2 points), and it's 5× heavier.

### Why `bge-large-en-v1.5` is eliminated

At 1.34 GB, it dominates laptop RAM. For a portfolio project with ~200 listings and low query volume, this is over-engineering. The quality delta over `bge-base` is <1.5 points — not worth it.

### `gte-small` vs `bge-small-en-v1.5`

`gte-small` is slightly smaller (67 MB) and fixes the token limit. But `bge-small-en-v1.5` scores 2+ points higher on MTEB retrieval, is only 130 MB (still very light), and is the more actively maintained model with better community support. The size trade-off is not meaningful at this scale.

### `bge-small-en-v1.5` vs `bge-base-en-v1.5`

`bge-base` is 1.5 points better on MTEB and has 768-dim vectors (vs 384). For this project:
- Both fix the token limit equally
- The listings corpus is small (~200 listings) — the quality gap between small and base won't be visible in practice
- `bge-small` loads ~3 seconds faster on CPU cold start; `bge-base` is noticeable
- `bge-small` is 130 MB; `bge-base` is 430 MB — difference matters when demoing locally

**Verdict**: `bge-small-en-v1.5` hits the right balance.

---

## Recommendation

**Switch to `BAAI/bge-small-en-v1.5`.**

- MTEB retrieval score jumps from 41.95 → 51.68 (+9.7 points — a meaningful quality improvement)
- 512-token limit provides headroom if `text` fields grow in future phases
- Only 130 MB — loads fast on CPU
- Drop-in compatible: same `HuggingFaceEmbeddings` API
- Fully local, no API key

> Note: truncation is **not** currently occurring (see Verification section above). This switch is a proactive quality upgrade, not a fix for an active bug.

---

## Migration Steps

The entire change is **3 lines** across 2 files.

### Step 1 — Update `config.py`

```python
# Before
EMBED_MODEL = "all-MiniLM-L6-v2"

# After
EMBED_MODEL = "BAAI/bge-small-en-v1.5"
```

### Step 2 — Delete and rebuild Chroma

The existing vectors are 384-dim encoded by MiniLM. They are incompatible with the new model's vectors, even though both happen to be 384-dim (dimensions match by coincidence, but the embedding space is different).

```bash
rm -rf chroma_db/
python -m pipeline.ingest
```

### Step 3 — Verify

```bash
python -m rag.rag_chain
```

Run the three test queries at the bottom of `rag_chain.py` and confirm results look correct.

### What does NOT change

- All scraper code
- All metadata filter logic (`build_where`)
- All LLM calls (extract + summarize)
- All frontend code
- The `text` field format in any scraper

The embedding model is fully isolated behind `EMBED_MODEL` in `config.py`.

---

## Note on `TRANSFORMERS_OFFLINE = "1"`

`rag_chain.py` line 16 sets `TRANSFORMERS_OFFLINE = "1"`, which prevents HuggingFace from making network calls at runtime. The new model must be **downloaded first** before this flag is set, or the model must already be cached locally.

On first run with the new model, either:
- Temporarily remove/comment out that line so HuggingFace can download the model
- Or pre-download manually: `python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-small-en-v1.5')"`

After the model is cached locally (~`~/.cache/huggingface/`), `TRANSFORMERS_OFFLINE = "1"` will work fine again.

---

## Decision

| | |
|--|--|
| **Selected model** | `BAAI/bge-small-en-v1.5` |
| **Rationale** | Quality upgrade (+9.7 MTEB), not a truncation fix (truncation not occurring) |
| **Status** | Pending implementation |
| **Blocking** | None — pure config change + Chroma rebuild |
