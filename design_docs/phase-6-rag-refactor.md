# Phase 6 — Retrieval Architecture Refactor

## Problem

Two issues, same root cause — the retriever is doing too much.

### Issue 1: Hard cap on results

`K_RESULTS = 6` in `config.py` means the retriever fetches at most 6 documents, full stop. A query like "cheapest one-bedroom near campus" may match 20+ valid listings, but only 6 ever enter the pipeline. The LLM (and the user) never see the rest.

### Issue 2: Structural constraints applied in the wrong place

The retriever uses only semantic similarity. When the user asks for "1 bedroom under $900, available now," the retriever has no concept of beds, price, or availability — it scores by text similarity alone. This means:
- A 2-bedroom listing that talks a lot about "one bedroom floor plans" can outrank a genuine 1BR
- Price and availability filtering is delegated to the LLM, which can misread metadata fields
- The LLM is forced to do the job of a database query

### What the current code actually does (important context)

Looking at `backend/main.py`:

```python
raw      = chain.invoke(req.query)         # LLM: sees 6 docs → writes summary
summary  = parse_json_output(raw).get("summary", "")
docs     = retriever.invoke(req.query)     # second call: all 6 docs → metadata
listings = [doc.metadata for doc in docs]
return { "answer": summary, "listings": listings }
```

The LLM's listing selection is already **ignored** — `listings` comes straight from the retriever, not from the LLM's JSON output. Only `summary` comes from the LLM. This means the fix is entirely at the retriever layer. The LLM's role in the pipeline is already narrower than it appears.

---

## Solution: Two-Phase Retrieval

The refactor splits the pipeline into two distinct jobs:

```
User NL query + optional explicit filters
          │
          ▼
  [Step 1] LLM extracts structured parameters
  { beds: 1, max_price_per_bed: 900, available_only: true, location_hint: "campus" }
          │
          ▼
  [Step 2] Chroma metadata pre-filter (WHERE clause)
  beds == 1 AND price_per_bed_low <= 900 * (1 + flex_margin) AND is_available == true
          │
          ▼
  [Step 3] Semantic re-rank on pre-filtered set (no hard cap)
  Surface the most relevant docs from the already-narrowed pool
          │
          ▼
  [Step 4] LLM writes summary only (no listing selection)
  "Found 14 available 1BR listings near campus. Sorted by price/bed."
          │
          ▼
  All matching listings returned to frontend
```

### Why separate extraction from retrieval?

Chroma supports `where` clauses on document metadata. The metadata fields stored in `chroma_db` include `beds`, `price_per_bed_low`, `price_per_bed_high`, `price_total_low`, `price_total_high`, `availability`, `company`, and (after the ingest update below) `is_available`. We should be using these for filtering, not leaving it to text similarity.

Note: `baths` is **not** stored in Chroma metadata and cannot be filtered. Excluded from the filter UI.

---

## Step 1 — Parameter Extraction Chain

Add a new lightweight LLM call before the main retrieval. Its only job is to parse the user's intent into a JSON struct. This should be fast (few tokens, short output).

### Extraction prompt

```python
EXTRACT_PROMPT = """
You are parsing a UIUC student's housing search query.
Extract structured search parameters. If a field is not mentioned, set it to null.

Query: {query}

Return ONLY valid JSON:
{{
  "beds": <integer or null>,
  "max_price_per_bed": <integer or null>,
  "max_price_total": <integer or null>,
  "available_only": <true | false | null>,
  "location_hint": "<string or null>"
}}

Examples:
- "1 bed under $900 available" → {{"beds": 1, "max_price_per_bed": 900, "available_only": true, "max_price_total": null, "location_hint": null}}
- "cheap 2br near campus" → {{"beds": 2, "max_price_per_bed": null, "max_price_total": null, "available_only": null, "location_hint": "campus"}}
- "show me everything" → {{"beds": null, "max_price_per_bed": null, "max_price_total": null, "available_only": null, "location_hint": null}}
- "studio apartment available" → {{"beds": 0, "max_price_per_bed": null, "max_price_total": null, "available_only": true, "location_hint": null}}
"""
```

Note: `baths` is excluded from the extraction schema — it is not stored in Chroma metadata and cannot be used in a `where` clause.

### `parse_json_output` — robust JSON extraction

> **Implementation note (discovered during testing):** `llama3.1:8b` frequently prepends prose to the JSON block, e.g. `"Here is the JSON response:\n```\n{...}\n```"`. The original `removeprefix/removesuffix` approach silently fails because the string doesn't start with a fence — it starts with `"Here is..."`. Fixed by using a regex to locate the first `{...}` block anywhere in the output.

```python
# In rag/rag_chain.py
import re

def parse_json_output(text: str) -> dict:
    # Try direct parse first (output is pure JSON)
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Fall back: extract first {...} block (handles prose prefix + fenced output)
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        return json.loads(match.group())
    raise ValueError(f"No JSON object found in LLM output: {text!r}")
```

This function is shared by both `extract_filters` and `summarize`.

### Extraction chain

```python
# Chain is prefixed _ to signal it is internal; callers use extract_filters()
_extract_chain = (
    PromptTemplate.from_template(EXTRACT_PROMPT)
    | llm
    | StrOutputParser()
)

def extract_filters(query: str) -> dict:
    try:
        raw = _extract_chain.invoke({"query": query})
        return parse_json_output(raw)
    except Exception:
        return {}  # fall back to unfiltered semantic search
```

### Merging with explicit UI filters

The `/api/search` endpoint will also accept explicit filter params (from the structured UI in Step 4). Explicit filters **override** extracted ones:

```python
def merge_filters(extracted: dict, explicit: dict) -> dict:
    merged = {**extracted}
    for k, v in explicit.items():
        if v is not None:
            merged[k] = v
    return merged
```

---

## Step 2 — Chroma Metadata Pre-filter

Chroma's `similarity_search()` accepts a `filter` parameter using its metadata filter DSL. Supported operators on metadata fields: `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`. String `$contains` / `$not_contains` are **not supported**.

### Pre-requisite: `is_available` field in `pipeline/ingest.py`

The raw `availability` field in Chroma is a messy string (e.g. `"Available August 2026, ***JUNE MOVE-IN SPECIAL!"`, `"Fully Leased – Not Available"`, `""`). Chroma has no `$contains` operator, so filtering on this string directly is not possible.

Solution: add a pre-computed `is_available: bool` field to the metadata during ingest, using the same logic as the frontend availability badge:

```python
def is_available(status: str) -> bool:
    s = status.lower()
    return "available" in s and "not available" not in s and "leased" not in s
```

This must be added to `pipeline/ingest.py` before the Chroma `where` filter will work for availability. After changing ingest, run `python -m pipeline.ingest` — the incremental updater will detect the new field on all existing docs and update them.

### Building the where clause

```python
PRICE_FLEX = 0.15   # allow up to 15% over stated budget

def build_where(filters: dict) -> dict | None:
    clauses = []

    if filters.get("beds") is not None:
        clauses.append({"beds": {"$eq": filters["beds"]}})

    if filters.get("max_price_per_bed") is not None:
        ceiling = int(filters["max_price_per_bed"] * (1 + PRICE_FLEX))
        clauses.append({"price_per_bed_low": {"$lte": ceiling}})

    if filters.get("max_price_total") is not None:
        ceiling = int(filters["max_price_total"] * (1 + PRICE_FLEX))
        clauses.append({"price_total_low": {"$lte": ceiling}})

    if filters.get("available_only"):
        clauses.append({"is_available": {"$eq": True}})

    if not clauses:
        return None
    if len(clauses) == 1:
        return clauses[0]
    return {"$and": clauses}
```

### Why 15% flex on price?

A user who says "`$900`" might stretch to `$950` for the right place. Returning a `$940` option and marking it "slightly over budget" is more useful than silently hiding it. The flex margin is applied at retrieval time; the frontend badges the over-budget ones visually. The `15%` constant lives in `config.py` as `PRICE_FLEX_MARGIN`.

### Why filter on `price_per_bed_low` (not `price_per_bed_high`)?

`price_per_bed_low` is the starting price for that floor plan. Filtering on the high end would hide plans where the cheapest unit fits the budget but the most expensive doesn't.

---

## Step 3 — Filtered Semantic Retrieval

> **Implementation note (design changed during implementation):** 
> The design originally proposed a `FilteredRetriever(BaseRetriever)` class and was replaced with a plain function `get_filtered_docs()`. 
> 
> Reason: `backend/main.py` calls retrieval directly (not inside a LangChain chain), so there is no benefit to subclassing `BaseRetriever` — it only adds boilerplate and makes passing `where` awkward (LangChain's `invoke()` signature doesn't support extra kwargs).

```python
# In rag/rag_chain.py — replaces RelativeThresholdRetriever
def get_filtered_docs(query: str, where: dict | None = None) -> list[Document]:
    results = vectorstore.similarity_search_with_relevance_scores(
        query, k=K_SEMANTIC, filter=where
    )
    if not results:
        return []
    top_score = results[0][1]
    return [doc for doc, score in results if top_score - score <= SCORE_GAP]
```

`K_SEMANTIC` replaces `K_RESULTS` — the old hard cap (`K_RESULTS = 6`) that limited retrieval to at most 6 documents regardless of how many listings matched the query. Set it high (e.g. 50) — the metadata `where` clause is now what limits the result set, not this number. The relative-threshold gap filter is kept to avoid returning completely off-topic documents if the `where` clause is empty.

> **Note on negative relevance scores:** `similarity_search_with_relevance_scores` may return negative values (e.g. `-0.24`) and emit a `UserWarning`. This is a known Chroma behavior when the cosine distance conversion yields values outside `[0, 1]`. The relative gap filter `top_score - score <= SCORE_GAP` still works correctly because it compares scores against each other, not against an absolute threshold. The warning is harmless.

New constants in `config.py`:

```python
K_SEMANTIC     = 50    # max docs to fetch after metadata pre-filter
SCORE_GAP      = 0.5   # unchanged
PRICE_FLEX_MARGIN = 0.15
```

---

## Step 4 — Updated Backend: `/api/search`

**File changed: `backend/main.py`**

### What was removed

The old import and handler:

```python
# REMOVED
from rag.rag_chain import chain, retriever, parse_json_output

class SearchRequest(BaseModel):
    query: str

@app.post("/api/search")
def search(req: SearchRequest):
    raw      = chain.invoke(req.query)
    summary  = parse_json_output(raw).get("summary", "")
    docs     = retriever.invoke(req.query)
    listings = [doc.metadata for doc in docs]
    return { "answer": summary, "listings": listings }
```

### What was added

New imports (Phase 6):

```python
# ADDED — replaces: chain, retriever, parse_json_output
from rag.rag_chain import extract_filters, merge_filters, build_where, get_filtered_docs, summarize
```

New request models (Phase 6):

```python
# ADDED
class FilterParams(BaseModel):
    beds: int | None = None
    max_price_per_bed: int | None = None
    available_only: bool | None = None

# MODIFIED — added optional filters field
class SearchRequest(BaseModel):
    query: str
    filters: FilterParams | None = None  # Phase 6: explicit UI filters
```

New search handler (Phase 6):

```python
# REPLACED — old handler was 5 lines; new handler runs the full two-phase pipeline
@app.post("/api/search")
def search(req: SearchRequest):
    extracted = extract_filters(req.query)
    explicit  = req.filters.model_dump(exclude_none=True) if req.filters else {}
    merged    = merge_filters(extracted, explicit)
    where     = build_where(merged)
    docs      = get_filtered_docs(req.query, where)
    listings  = [doc.metadata for doc in docs]
    summary   = summarize(req.query, listings, merged)
    return {
        "answer":          summary,
        "listings":        listings,
        "filters_applied": {k: v for k, v in merged.items() if v is not None},
    }
```

> **Note on `filters_applied`:** the original response only returned `answer` and `listings`. The new field `filters_applied` sends the merged filter dict back to the frontend so it can display what constraints are active (e.g. "Showing 1BR · Available only"). Only non-null values are included.

### Summary-only prompt

The LLM no longer needs to output listings. Simplified prompt:

```python
SUMMARY_PROMPT = """
You are a UIUC housing assistant. The following listings were found matching the student's query.
Do not invent data. Write one short sentence summarizing the results.

STUDENT QUERY: {question}
FILTERS APPLIED: {filters}
RESULT COUNT: {count}
SAMPLE LISTINGS: {sample}

Return ONLY a valid JSON object:
{{"summary": "string"}}
"""
```

Pass only a sample (first 5 listings) to the LLM to keep the prompt short — it doesn't need all 30 results to write a one-line summary.

---

## Step 5 — Frontend: Structured Filter Panel

Add a filter bar above the chat input. Filters are sent alongside the NL query on every search.

### Filter fields

| Field | UI element | Values |
|---|---|---|
| Bedrooms | Button group | Any · Studio · 1 · 2 · 3 · 4+ |
| Availability | Toggle | All listings / Available only ✓ |
| Max price/bed | Number input | free-form, optional |

Bathrooms omitted from v1 — not stored in Chroma metadata, cannot be filtered.

> **Studio vs. 1BR:** Studios are stored as `beds=0` in Chroma (scraped value). The button label "Studio" is a UI-layer alias — the user never sees "0 bedrooms". The backend receives `beds: 0` and `build_where()` applies `$eq: 0`.

> **"4+" implementation note:** the "4+" button sends `beds: 4` to the backend. `build_where()` in `rag/rag_chain.py` uses `$gte` when `beds >= 4`, so it correctly matches 4, 5, 6-bedroom units. Buttons Studio–3 use `$eq`.

---

### Files changed

#### `rag/rag_chain.py` — modified `build_where()`

The beds clause was changed from always using `$eq` to using `$gte` for values ≥ 4, to support the "4+" button:

```python
# BEFORE
clauses.append({"beds": {"$eq": int(filters["beds"])}})

# AFTER
beds = int(filters["beds"])
op = "$gte" if beds >= 4 else "$eq"
clauses.append({"beds": {op: beds}})
```

---

#### `frontend/lib/api.ts` — modified

**Added** `is_available` field to `Listing` interface (populated by `pipeline/ingest.py`):
```typescript
is_available: boolean   // Phase 6: pre-computed in ingest.py
```

**Added** `Filters` interface and `DEFAULT_FILTERS` constant:
```typescript
export interface Filters {
  beds: number | null
  available_only: boolean | null
  max_price_per_bed: number | null
}

export const DEFAULT_FILTERS: Filters = {
  beds: null,
  available_only: null,
  max_price_per_bed: null,
}
```

**Added** `filters_applied` to `SearchResponse`:
```typescript
filters_applied: Record<string, unknown>  // echoed back from backend
```

**Modified** `search()` — added `filters` parameter:
```typescript
// BEFORE
export async function search(query: string): Promise<SearchResponse>

// AFTER
export async function search(query: string, filters: Filters): Promise<SearchResponse>
// body: JSON.stringify({ query, filters })
```

---

#### `frontend/components/FilterPanel.tsx` — new file

New component rendered between the chat thread and the input bar. Three controls:
- **Beds** button group: Any / Studio / 1 / 2 / 3 / 4+. "Studio" sends `beds: 0`; label is friendly, internal value is not shown to user. Active button is blue. Clicking an already-active button deselects it (resets to null).
- **Availability** toggle: shows "All listings" or "Available only ✓" (green when active).
- **Max $/bed** number input with `$` prefix.
- **Clear filters** link appears in the top-right only when at least one filter is set.

---

#### `frontend/app/page.tsx` — modified

**Added** `filters` state and import of `FilterPanel`:
```typescript
// ADDED
import FilterPanel from "@/components/FilterPanel"
import { search, Listing, Filters, DEFAULT_FILTERS } from "@/lib/api"

const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
```

**Modified** `Message` type — added `maxPricePerBed` to assistant messages so each response remembers what budget was active when it was generated:
```typescript
// BEFORE
| { role: "assistant"; answer: string; listings: Listing[] }

// AFTER
| { role: "assistant"; answer: string; listings: Listing[]; maxPricePerBed: number | null }
```

**Modified** `submit()` — captures `max_price_per_bed` at call time and passes `filters` to `search()`:
```typescript
const maxPricePerBed = filters.max_price_per_bed   // capture before any state change
const res = await search(q, filters)
// assistant message now includes maxPricePerBed
```

**Added** `<FilterPanel>` between the chat thread and the input bar:
```tsx
<FilterPanel filters={filters} onChange={setFilters} />
```

**Modified** `<AssistantMessage>` render — passes `maxPricePerBed` down:
```tsx
<AssistantMessage answer={m.answer} listings={m.listings} maxPricePerBed={m.maxPricePerBed} />
```

---

#### `frontend/components/AssistantMessage.tsx` — modified

**Added** `maxPricePerBed` prop and passed it to `SummaryTable`:
```typescript
// ADDED to props
maxPricePerBed: number | null

// MODIFIED — SummaryTable call
<SummaryTable listings={listings} maxPricePerBed={maxPricePerBed} />
```

---

#### `frontend/components/SummaryTable.tsx` — modified

**Added** `maxPricePerBed` prop:
```typescript
// ADDED to props
maxPricePerBed: number | null
```

**Modified** header — added result count on the right:
```tsx
// BEFORE
<h3 className="...">Summary</h3>

// AFTER
<h3 className="...">Summary</h3>
<span className="text-xs text-slate-400">{listings.length} listing{listings.length !== 1 ? "s" : ""} found</span>
```

**Modified** price/bed cell — added amber "over budget" badge when `price_per_bed_high > maxPricePerBed`:
```tsx
{overBudget && (
  <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">
    over budget
  </span>
)}
```

Where `overBudget` is computed per row:
```typescript
const overBudget =
  maxPricePerBed !== null &&
  l.price_per_bed_high !== null &&
  l.price_per_bed_high > maxPricePerBed
```

---

## What We Considered and Ruled Out

**Option: Raise K_RESULTS to 20 or 50**  
Ruled out — doesn't fix the structural problem. Retrieval is still pure semantic similarity; a high K just means more off-topic docs get passed to the LLM. Chroma metadata filtering is the right tool for structured constraints.

**Option: Let the LLM do the filtering from a larger candidate set**  
Ruled out — the backend already ignores the LLM's listing selection (see "What the current code actually does" above). Asking the LLM to re-filter 50 docs is expensive and less reliable than a database `WHERE` clause.

**Option: Move filtering entirely to SQLite instead of Chroma**  
Ruled out for now — would require a separate query path that bypasses the vector store. The value of semantic search is handling vague queries like "quiet place near the quad." Chroma's `where` clause gives us the best of both: metadata filtering + semantic ranking in one call.

**Option: LangChain Agents / tool-calling**  
Ruled out — overkill. The query structure here is simple (one intent, a handful of parameters). A full agent loop adds latency and failure modes without meaningfully better results.

**Option: Paginate the backend**  
Ruled out — return all results, let the frontend handle display. Pagination at the API layer adds state and complexity. If a query returns 40 listings, showing them all in the table (sortable, filterable by the user) is better than artificial pages.

---

## Files Changed

| File | Change |
|---|---|
| `pipeline/ingest.py` | Add `is_available: bool` to Chroma metadata; run once to update all 867 docs |
| `config.py` | Add `K_SEMANTIC`, `PRICE_FLEX_MARGIN`; rename `K_RESULTS` |
| `rag/rag_chain.py` | Add `extract_chain`, `extract_filters()`, `build_where()`, `FilteredRetriever`, `summarize()` |
| `backend/main.py` | Update `SearchRequest`, new search handler |
| `frontend/lib/api.ts` | Add `filters` param to `search()` |
| `frontend/app/page.tsx` | Add filter state, pass to `search()` |
| `frontend/components/FilterPanel.tsx` | New component: beds · availability · price |
| `frontend/components/SummaryTable.tsx` | Show result count; add over-budget badge |

---

---

## Step 6 — UI Polish

A series of incremental UI improvements made after the core Phase 6 pipeline was working.

### Sidebar

- Restructured the "About" section: data sources and listings are now displayed as indented bullet-point lists rather than inline text. Each company logo appears on its own line under "Data sources:", and floor plan count and property count appear as separate bullets under "Listings:".

### Filter bar

- Centered the filter bar controls horizontally instead of left-aligning them.
- Added a "Source" control to the filter bar, allowing users to filter by company. The control shows an "All" button and a logo button for each company; the active selection gets a blue highlight.

### Table view

- Increased the company logo height in the Source column for better legibility.
- Removed the "Link" column. The building address is now a clickable hyperlink that opens the listing directly, styled in a Morandi-palette muted dusty blue (`#7B90A0`) with a subtle underline. Hover darkens it to `#556070`.
- The availability column now breaks onto a new line at every comma, colon, or exclamation mark, without removing the punctuation character.

### Card view

- Changed the grid from 2 columns to 3 columns per row.
- Redesigned each card for the narrower column: reduced padding and font sizes, stacked all elements vertically (company logo → address → availability badge → layout + rent → link).
- Moved the availability badge to the top-right corner of each card using absolute positioning; added right padding to the address so long addresses don't run beneath the badge.
- Increased the address font size by one step for better readability.
- Changed the availability badge from an inline `<span>` to `inline-block` so that when its text wraps, it renders as one solid background rectangle rather than two separate highlighted lines.
- The availability badge now breaks onto a new line at every comma, colon, or exclamation mark, without removing the punctuation character.
- For studios and 1-bedroom units, the rent is shown as the total monthly price only (no per-bed breakdown, since there is only one occupant). For 2+ bedroom units, both per-bed and total rent are shown.

---

## Checklist

- [ ] Add `is_available: bool` to metadata in `pipeline/ingest.py`
- [ ] Run `python -m pipeline.ingest` → verify `is_available` field appears in Chroma metadata
- [ ] Add `K_SEMANTIC`, `PRICE_FLEX_MARGIN` to `config.py`; remove `K_RESULTS`
- [ ] Implement `extract_chain` + `extract_filters()` in `rag/rag_chain.py`
- [ ] Implement `build_where()` in `rag/rag_chain.py`
- [ ] Implement `FilteredRetriever` (replaces `RelativeThresholdRetriever`)
- [ ] Update `summarize()` — summary-only prompt, no listing selection
- [ ] Update `backend/main.py` — new `SearchRequest`, new handler
- [ ] Test: "1BR under $900 available" returns all matching docs (not capped at 6)
- [ ] Test: empty `where` clause (unfiltered query) still works
- [ ] Test: price flex — "$900" ceiling retrieves listings up to $1035, badges them
- [ ] Add `FilterPanel.tsx` to frontend
- [ ] Wire filter state in `page.tsx`
- [ ] Update `lib/api.ts` to send filters
- [ ] Add result count display above `SummaryTable`
- [ ] Add over-budget badge in `SummaryTable` / `ListingCard`
