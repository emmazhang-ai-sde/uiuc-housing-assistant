# rag_chain.py
# Phase 6 refactor: two-phase retrieval (metadata pre-filter + semantic re-rank)
# LLM is used only for (1) parameter extraction and (2) one-line summary generation.
# Listing selection is no longer done by the LLM — the metadata where clause handles it.
#
# Run:    python -m rag.rag_chain
# Output: prints filter extraction + result count + summary for each test query

import math
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
        bed_filter = filters["beds"]
        selected_beds = bed_filter if isinstance(bed_filter, list) else [bed_filter]
        exact_beds = sorted({int(bed) for bed in selected_beds if int(bed) < 4})
        has_four_plus = any(int(bed) >= 4 for bed in selected_beds)

        bed_clauses = []
        if exact_beds:
            bed_clauses.append({"beds": {"$in": exact_beds}})
        # 4+ button sends beds=4; use $gte so it catches 4, 5, 6-bedroom units too
        if has_four_plus:
            bed_clauses.append({"beds": {"$gte": 4}})

        if len(bed_clauses) == 1:
            clauses.append(bed_clauses[0])
        elif bed_clauses:
            clauses.append({"$or": bed_clauses})

    if filters.get("max_price_per_bed") is not None:
        price        = filters["max_price_per_bed"]
        btype        = filters.get("buffer_type") or "percent"
        bvalue       = filters.get("buffer_value")
        if btype == "percent":
            ceiling = int(price * (1 + (bvalue if bvalue is not None else PRICE_FLEX_MARGIN * 100) / 100))
        elif btype == "fixed":
            ceiling = int(price + (bvalue or 0))
        else:  # "exact"
            ceiling = int(price)
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


# ── Step 4: Proximity filter (Phase 7) ───────────────────────────────────────
# Chroma doesn't support distance-based where clauses, so we post-filter after
# semantic retrieval. Each entry is (aliases, (lat, lng)); first matching alias wins.

PROXIMITY_RADIUS_MI = 0.5

_LANDMARK_REGISTRY: list[tuple[list[str], tuple[float, float]]] = [
    (["grainger", "engineering library"],              (40.1125, -88.2269)),
    (["siebel", "cs building", "computer science"],    (40.1140, -88.2244)),
    (["cif", "campus instructional"],                  (40.1125, -88.2283)),
    (["bif", "gies", "business school", "business instructional"], (40.1020, -88.2310)),
    (["law library", "law school", "college of law"],  (40.1010, -88.2315)),
    (["main quad", "quad"],                            (40.1072, -88.2270)),
    (["arc", "recreation center"],                     (40.1016, -88.2370)),
    (["green street", "green st", "campustown"],       (40.1096, -88.2100)),
    (["fresh international", "fresh market"],          (40.1112, -88.2445)),
    (["far east grocery", "far east market"],          (40.1157, -88.2323)),
    (["mcdonald", "mcdonalds"],                        (40.1105, -88.2298)),
    (["target"],                                       (40.1102, -88.2302)),
    (["walgreens", "pharmacy"],                        (40.1100, -88.2327)),
]


def _haversine_mi(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 3958.8
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def _resolve_landmark(hint: str) -> tuple[float, float] | None:
    h = hint.lower()
    for aliases, coords in _LANDMARK_REGISTRY:
        if any(a in h for a in aliases):
            return coords
    return None


def filter_by_location(docs: list[Document], location_hint: str | None) -> list[Document]:
    """Drop listings farther than PROXIMITY_RADIUS_MI from the named landmark.
    Returns docs unchanged if hint is absent, unrecognised, or listing lacks coords."""
    if not location_hint:
        return docs
    target = _resolve_landmark(location_hint)
    if target is None:
        return docs
    tlat, tlng = target
    return [
        doc for doc in docs
        if doc.metadata.get("lat") is not None
        and doc.metadata.get("lng") is not None
        and _haversine_mi(doc.metadata["lat"], doc.metadata["lng"], tlat, tlng) <= PROXIMITY_RADIUS_MI
    ] or docs  # fall back to unfiltered if every listing lacks coords


# ── Step 5: Summary-only LLM call (Phase 6) ───────────────────────────────────
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
