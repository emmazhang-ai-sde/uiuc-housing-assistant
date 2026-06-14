# rag_chain.py
# Phase 6 refactor: two-phase retrieval (metadata pre-filter + semantic re-rank)
# LLM is used only for (1) parameter extraction and (2) one-line summary generation.
# Listing selection is no longer done by the LLM — the metadata where clause handles it.
#
# Run:    python -m rag.rag_chain
# Output: prints filter extraction + result count + summary for each test query

import os, sys, json, re
from pathlib import Path

if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent.parent))

os.environ["TRANSFORMERS_OFFLINE"] = "1"

from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_ollama import ChatOllama
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.documents import Document
from config import CHROMA_DIR, EMBED_MODEL, LLM_MODEL, K_SEMANTIC, SCORE_GAP, PRICE_FLEX_MARGIN

# ── Shared resources ──────────────────────────────────────────────────────────
embeddings  = HuggingFaceEmbeddings(model_name=EMBED_MODEL)
vectorstore = Chroma(persist_directory=CHROMA_DIR, embedding_function=embeddings)
llm         = ChatOllama(model=LLM_MODEL)


def parse_json_output(text: str) -> dict:
    # LLMs often add prose before/after the JSON block (e.g. "Here is the response:\n```...```").
    # Try direct parse first; fall back to extracting the first {...} block via regex.
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        return json.loads(match.group())
    raise ValueError(f"No JSON object found in LLM output: {text!r}")


# ── Step 1: Parameter extraction (Phase 6) ────────────────────────────────────
# LLM reads the NL query and outputs a small JSON of structured filter params.
# Baths is intentionally excluded — that field is not stored in Chroma metadata.

EXTRACT_PROMPT = """You are parsing a UIUC student's housing search query.
Extract structured search parameters. If a field is not mentioned, set it to null.

Query: {query}

Return ONLY valid JSON — no prose, no markdown fences:
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

_extract_chain = (
    PromptTemplate.from_template(EXTRACT_PROMPT)
    | llm
    | StrOutputParser()
)


def extract_filters(query: str) -> dict:
    """Extract structured filter params from a natural language query.
    Returns empty dict on failure — caller falls back to unfiltered search."""
    try:
        raw = _extract_chain.invoke({"query": query})
        return parse_json_output(raw)
    except Exception:
        return {}


def merge_filters(extracted: dict, explicit: dict) -> dict:
    """Merge NL-extracted filters with explicit UI filters. Explicit values win."""
    merged = {**extracted}
    for k, v in explicit.items():
        if v is not None:
            merged[k] = v
    return merged


# ── Step 2: Chroma where clause (Phase 6) ────────────────────────────────────
# Converts filter params to Chroma's metadata filter DSL.
# Supported operators: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin.
# $contains / $not_contains do NOT exist in Chroma — availability uses is_available bool instead.

def build_where(filters: dict) -> dict | None:
    clauses = []

    if filters.get("beds") is not None:
        beds = int(filters["beds"])
        # 4+ button sends beds=4; use $gte so it catches 4, 5, 6-bedroom units too
        op = "$gte" if beds >= 4 else "$eq"
        clauses.append({"beds": {op: beds}})

    if filters.get("max_price_per_bed") is not None:
        ceiling = int(filters["max_price_per_bed"] * (1 + PRICE_FLEX_MARGIN))
        clauses.append({"price_per_bed_low": {"$lte": ceiling}})

    if filters.get("max_price_total") is not None:
        ceiling = int(filters["max_price_total"] * (1 + PRICE_FLEX_MARGIN))
        clauses.append({"price_total_low": {"$lte": ceiling}})

    if filters.get("available_only"):
        clauses.append({"is_available": {"$eq": True}})

    if filters.get("company"):
        clauses.append({"company": {"$eq": filters["company"]}})

    if not clauses:
        return None
    if len(clauses) == 1:
        return clauses[0]
    return {"$and": clauses}


# ── Step 3: Filtered semantic retrieval (Phase 6) ─────────────────────────────
# Replaces RelativeThresholdRetriever.
# Order: metadata where clause narrows the pool → semantic similarity ranks survivors
# → score gap trims off-topic stragglers. No hard cap on result count.

def get_filtered_docs(query: str, where: dict | None = None) -> list[Document]:
    results = vectorstore.similarity_search_with_relevance_scores(
        query, k=K_SEMANTIC, filter=where
    )
    if not results:
        return []
    top_score = results[0][1]
    return [doc for doc, score in results if top_score - score <= SCORE_GAP]


# ── Step 4: Summary-only LLM call (Phase 6) ───────────────────────────────────
# LLM no longer selects or ranks listings — it only writes a one-line summary.
# Only the first 5 listings are passed to keep the prompt short.

SUMMARY_PROMPT = """You are a UIUC housing assistant. Listings matching the student's query have already been retrieved and filtered.
Your only job is to write one short sentence summarizing what was found.
Do not invent addresses, prices, or availability. Do not list individual units.

STUDENT QUERY: {question}
FILTERS APPLIED: {filters}
TOTAL RESULTS: {count}
SAMPLE LISTINGS (first 5): {sample}

Return ONLY a valid JSON object — no prose, no markdown fences:
{{"summary": "string"}}

Example: {{"summary": "Found 14 available 1BR listings near campus, ranging from $750–$950/bed."}}
"""

_summary_chain = (
    PromptTemplate.from_template(SUMMARY_PROMPT)
    | llm
    | StrOutputParser()
)


def summarize(query: str, listings: list[dict], filters: dict) -> str:
    """Generate a one-line summary of the retrieved listings."""
    active_filters = {k: v for k, v in filters.items() if v is not None}
    try:
        raw = _summary_chain.invoke({
            "question": query,
            "filters":  json.dumps(active_filters),
            "count":    len(listings),
            "sample":   json.dumps(listings[:5], default=str),
        })
        return parse_json_output(raw).get("summary", "")
    except Exception:
        return f"Found {len(listings)} listings matching your search."


# ── Test ──────────────────────────────────────────────────────────────────────
TEST_QUERIES = [
    "1 bedroom under $900 available now",
    "cheap 2 bedroom near campus",
    "show me everything",
]

if __name__ == "__main__":
    for q in TEST_QUERIES:
        print(f"\n{'='*65}")
        print(f"Q: {q}")
        print(f"{'='*65}")
        extracted = extract_filters(q)
        print(f"Extracted : {extracted}")
        where = build_where(extracted)
        print(f"Where     : {where}")
        docs  = get_filtered_docs(q, where)
        listings = [d.metadata for d in docs]
        print(f"Results   : {len(listings)}")
        summary = summarize(q, listings, extracted)
        print(f"Summary   : {summary}")
