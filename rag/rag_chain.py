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

from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.documents import Document
from config import CHROMA_DIR, EMBED_MODEL, LLM_MODEL, K_SEMANTIC, SCORE_GAP, PRICE_FLEX_MARGIN

# ── LLM provider selection ─────────────────────────────────────────────────────
# Set LLM_PROVIDER=groq  (recommended — works locally and in cloud deployment)
# Set LLM_PROVIDER=ollama (optional — requires local Ollama daemon + pulled model)
_provider = os.getenv("LLM_PROVIDER", "ollama").lower()

if _provider == "groq":
    from langchain_groq import ChatGroq
    llm = ChatGroq(
        model="llama-3.1-8b-instant",
        api_key=os.environ["GROQ_API_KEY"],
    )
else:
    from langchain_ollama import ChatOllama
    llm = ChatOllama(model=LLM_MODEL)

# ── Shared resources ──────────────────────────────────────────────────────────
embeddings  = HuggingFaceEmbeddings(model_name=EMBED_MODEL)
vectorstore = Chroma(persist_directory=CHROMA_DIR, embedding_function=embeddings)


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
Extract structured search parameters. Set a field only when the query explicitly mentions it — otherwise set it to null.
{history}
Query: {query}

Return ONLY valid JSON — no prose, no markdown fences:
{{
  "beds": <integer or null>,
  "min_price_per_bed": <integer or null>,
  "max_price_per_bed": <integer or null>,
  "max_price_total": <integer or null>,
  "availability_window": <"now" | "june_2026" | "july_2026" | "august_2026" | "leased" | null>,
  "location_hint": "<string or null>",
  "property_type": <"Apartment" | "House" | "Townhouse" | "Single Family Home" | null>,
  "penthouse": <true | null>
}}

beds rules — set only when explicitly mentioned:
- "studio" or "efficiency" → 0
- "1 bed", "1br", "one bedroom" → 1
- "2 bed", "2br", "two bedroom" → 2
- "3 bed", "3br" → 3
- "4 bed", "4br" → 4
- "5 bed", "5br", "5+", "5 or more", "large group" → 5
- null → not mentioned

price direction — FIRST decide if each amount is a FLOOR or a CEILING from the wording, BEFORE picking a field:
- FLOOR words (a minimum the user will accept): "above", "over", "more than", "greater than", "at least", "no less than", "starting at", "$X and up", "nothing under $X", "avoid cheap ones under $X" → this is a min, set min_price_per_bed
- CEILING words (a maximum budget): "under", "below", "less than", "at most", "up to", "max", "no more than", "within $X", "budget of $X" → this is a max
- A range ("$1000 to $1300", "between $1000 and $1300", "$1000-$1300") sets BOTH: min_price_per_bed = 1000 and max_price_per_bed = 1300
- CRITICAL: "above/over/more than $X" is ALWAYS a floor. Never place that amount in max_price_per_bed or max_price_total.

min_price_per_bed (the FLOOR from the rule above):
- Set it to X whenever a floor is stated ("above $1500", "at least $900", "nothing under $1000") or as the low end of a range
- null if no lower bound is mentioned

max_price_per_bed vs max_price_total (only for a CEILING amount):
- Set max_price_per_bed when user says "per person", "per bed", "each", or the amount is ≤ $1,500
- Set max_price_total when user says "total", "per month for the whole unit", or the amount is > $1,500
- Set both to null if no ceiling is mentioned (a floor-only query like "above $1500" leaves BOTH max fields null)

availability_window rules:
- "now" → available now, immediate move-in, move in today, move in this month
- "june_2026" → June, June 2026
- "july_2026" → July, July 2026
- "august_2026" → August, fall semester, fall 2026
- "leased" → already leased, unavailable, show me what's gone
- null → not mentioned

property_type rules — set only when the query clearly refers to a building type:
- "townhouse", "townhome" → "Townhouse"
- "single family", "single-family", "detached house" → "Single Family Home"
- "house" → "House"
- "apartment", "apt", "condo", "unit" → "Apartment"
- null → not mentioned or ambiguous

penthouse rules:
- true → query mentions "penthouse"
- null → not mentioned

Examples:
- "1 bed under $900 available now" → {{"beds": 1, "min_price_per_bed": null, "max_price_per_bed": 900, "max_price_total": null, "availability_window": "now", "location_hint": null, "property_type": null, "penthouse": null}}
- "studio between $1000 and $1300, nothing under $1000" → {{"beds": 0, "min_price_per_bed": 1000, "max_price_per_bed": 1300, "max_price_total": null, "availability_window": null, "location_hint": null, "property_type": null, "penthouse": null}}
- "studios above $1,500" → {{"beds": 0, "min_price_per_bed": 1500, "max_price_per_bed": null, "max_price_total": null, "availability_window": null, "location_hint": null, "property_type": null, "penthouse": null}}
- "1br over $1200 per bed" → {{"beds": 1, "min_price_per_bed": 1200, "max_price_per_bed": null, "max_price_total": null, "availability_window": null, "location_hint": null, "property_type": null, "penthouse": null}}
- "cheap 2br near campus" → {{"beds": 2, "min_price_per_bed": null, "max_price_per_bed": null, "max_price_total": null, "availability_window": null, "location_hint": "campus", "property_type": null, "penthouse": null}}
- "studio available for fall" → {{"beds": 0, "min_price_per_bed": null, "max_price_per_bed": null, "max_price_total": null, "availability_window": "august_2026", "location_hint": null, "property_type": null, "penthouse": null}}
- "4 bedroom house under $3000/month" → {{"beds": 4, "min_price_per_bed": null, "max_price_per_bed": null, "max_price_total": 3000, "availability_window": null, "location_hint": null, "property_type": "House", "penthouse": null}}
- "penthouse apartment downtown" → {{"beds": null, "min_price_per_bed": null, "max_price_per_bed": null, "max_price_total": null, "availability_window": null, "location_hint": "downtown", "property_type": "Apartment", "penthouse": true}}
- "show me everything" → {{"beds": null, "min_price_per_bed": null, "max_price_per_bed": null, "max_price_total": null, "availability_window": null, "location_hint": null, "property_type": null, "penthouse": null}}
"""

_extract_chain = (
    PromptTemplate.from_template(EXTRACT_PROMPT)
    | llm
    | StrOutputParser()
)


def extract_filters(query: str, history: list[dict] | None = None) -> dict:
    # [Step 3] Prepend last 3 exchanges so the LLM can resolve multi-turn references
    # (e.g. "那附近" → location from a previous message, "what about 2BR?" → keep prior filters)
    history_text = ""
    if history:
        lines = []
        for msg in history[-6:]:
            role = "User" if msg["role"] == "user" else "Assistant"
            lines.append(f"{role}: {msg['content']}")
        history_text = "Recent conversation:\n" + "\n".join(lines) + "\n\n"

    raw = _extract_chain.invoke({"query": query, "history": history_text})
    try:
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
        exact_beds = sorted({int(bed) for bed in selected_beds if int(bed) < 5})
        has_five_plus = any(int(bed) >= 5 for bed in selected_beds)

        bed_clauses = []
        if exact_beds:
            bed_clauses.append({"beds": {"$in": exact_beds}})
        # 5+ button sends beds=5; use $gte so it catches 5, 6, 16-bedroom units too
        if has_five_plus:
            bed_clauses.append({"beds": {"$gte": 5}})

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

    # Price floor — e.g. "nothing under $1000". Filter on the low (headline) price
    # shown on the card, so a listing advertised below the floor never appears.
    if filters.get("min_price_per_bed") is not None:
        clauses.append({"price_per_bed_low": {"$gte": int(filters["min_price_per_bed"])}})

    if filters.get("max_price_total") is not None:
        ceiling = int(filters["max_price_total"] * (1 + PRICE_FLEX_MARGIN))
        clauses.append({"price_total_low": {"$lte": ceiling}})

    window = filters.get("availability_window")
    if window == "now":
        clauses.append({"is_available_now": {"$eq": True}})
    elif window == "june_2026":
        clauses.append({"is_available_june": {"$eq": True}})
    elif window == "july_2026":
        clauses.append({"is_available_july": {"$eq": True}})
    elif window == "august_2026":
        clauses.append({"is_available_august": {"$eq": True}})
    elif window == "leased":
        clauses.append({"is_leased": {"$eq": True}})
    # No specific window, but caller wants only rentable units (default when a student
    # is actively searching) — exclude anything fully leased.
    elif filters.get("available_only"):
        clauses.append({"is_available": {"$eq": True}})

    if filters.get("company"):
        clauses.append({"company": {"$eq": filters["company"]}})

    if filters.get("property_type"):
        clauses.append({"property_type": {"$eq": filters["property_type"]}})

    if filters.get("penthouse"):
        clauses.append({"is_penthouse": {"$eq": True}})

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
    (["green and 6th", "green/6th", "green st/6th", "6th and green", "6th street and green"], (40.1102, -88.2302)),
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
