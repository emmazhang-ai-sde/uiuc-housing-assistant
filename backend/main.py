import os
import sqlite3
import jwt
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from groq import BadRequestError as GroqBadRequestError
from pydantic import BaseModel
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage, RemoveMessage
from rag.rag_chain import extract_filters, merge_filters, build_where, get_filtered_docs, filter_by_location, summarize
from rag.agent import agent, ui_filters, MAX_CHECKPOINTED_MESSAGES
from config import SNAPSHOTS_DIR


app = FastAPI()

_security   = HTTPBearer(auto_error=False)
_DEV_MODE   = os.getenv("DEV_MODE", "false").lower() == "true"

# Supabase signs access tokens with asymmetric ES256 keys (JWT Signing Keys), not the
# legacy HS256 shared secret. Verify against the project's public JWKS endpoint.
# PyJWKClient caches fetched keys, so this doesn't hit the network per request.
_SUPABASE_URL = os.getenv("SUPABASE_URL", "https://uknyhpwzvdevxfxkpxmy.supabase.co")
_jwks_client  = jwt.PyJWKClient(f"{_SUPABASE_URL}/auth/v1/.well-known/jwks.json")

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(_security)):
    if _DEV_MODE:
        return
    if not credentials:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(credentials.credentials)
        jwt.decode(
            credentials.credentials,
            signing_key.key,
            algorithms=["ES256"],
            audience="authenticated",
        )
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid or expired token: {e}")

_raw = os.getenv("ALLOWED_ORIGINS", "*")
_origins = [o.strip() for o in _raw.split(",")] if _raw != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# Phase 6: explicit UI filters sent alongside the NL query
class FilterParams(BaseModel):
    beds: int | list[int] | None = None
    max_price_per_bed: int | None = None
    availability_window: str | None = None  # "now" | "june_2026" | "july_2026" | "august_2026" | "leased"
    company: str | None = None
    buffer_type: str | None = None   # "percent" | "fixed" | "exact"
    buffer_value: float | None = None
    property_type: str | None = None  # "Apartment" | "House" | "Townhouse" | "Single Family Home"


class SearchRequest(BaseModel):
    query: str
    filters: FilterParams | None = None


@app.get("/api/status")
def status():
    latest_txt = os.path.join(SNAPSHOTS_DIR, "latest.txt")
    if not os.path.exists(latest_txt):
        return {"last_scraped": None, "listing_count": None, "property_count": None}
    date_str = open(latest_txt).read().strip()
    db_path = os.path.join(SNAPSHOTS_DIR, f"listings_{date_str}.db")
    if not os.path.exists(db_path):
        return {"last_scraped": date_str, "listing_count": None, "property_count": None}
    con = sqlite3.connect(db_path)
    row = con.execute(
        "SELECT COUNT(*) as listing_count, COUNT(DISTINCT address) as property_count FROM listings"
    ).fetchone()
    con.close()
    return {"last_scraped": date_str, "listing_count": row[0], "property_count": row[1]}


@app.get("/api/listings")
def get_listings(
    beds:               list[int] | None = Query(None),
    max_price_per_bed:  int       | None = Query(None),
    buffer_type:        str       | None = Query(None),   # "percent" | "fixed" | "exact"
    buffer_value:       float     | None = Query(None),
    availability_window: str      | None = Query(None),   # "now" | "june_2026" | ...
    company:            str       | None = Query(None),
    property_type:      str       | None = Query(None),
    penthouse:          bool      | None = Query(None),
    page:               int       | None = Query(None, ge=1),
    page_size:          int       | None = Query(None, ge=1, le=100),
    _=Depends(verify_token),
):
    latest_txt = os.path.join(SNAPSHOTS_DIR, "latest.txt")
    if not os.path.exists(latest_txt):
        return {"listings": []}
    date_str = open(latest_txt).read().strip()
    db_path  = os.path.join(SNAPSHOTS_DIR, f"listings_{date_str}.db")
    if not os.path.exists(db_path):
        return {"listings": []}

    clauses: list[str] = []
    params:  list      = []

    if beds:
        exact_beds   = [b for b in beds if b < 5]
        has_five_plus = any(b >= 5 for b in beds)
        parts = []
        if exact_beds:
            placeholders = ",".join("?" * len(exact_beds))
            parts.append(f"beds IN ({placeholders})")
            params.extend(exact_beds)
        if has_five_plus:
            parts.append("beds >= 5")
        if parts:
            clauses.append(f"({' OR '.join(parts)})")

    if max_price_per_bed is not None:
        btype = buffer_type or "percent"
        bval  = buffer_value
        if btype == "percent":
            ceiling = int(max_price_per_bed * (1 + (bval if bval is not None else 15) / 100))
        elif btype == "fixed":
            ceiling = int(max_price_per_bed + (bval or 0))
        else:
            ceiling = int(max_price_per_bed)
        clauses.append("price_per_bed_low <= ?")
        params.append(ceiling)

    # Month windows use '%Month%2026%' (not '%Month 2026%') so dated strings like
    # "Available August 14, 2026" and annotated ones like "Available August 2026
    # (1 of 12 units)" match too — several scrapers emit exact move-in dates.
    if availability_window == "now":
        clauses.append("(availability LIKE '%Available Now%' OR availability LIKE '%Immediate Move-In%')")
    elif availability_window == "june_2026":
        clauses.append("availability LIKE '%Available June%2026%'")
    elif availability_window == "july_2026":
        clauses.append("availability LIKE '%Available July%2026%'")
    elif availability_window == "august_2026":
        clauses.append("availability LIKE '%Available August%2026%'")
    elif availability_window == "leased":
        clauses.append("availability LIKE '%Leased%'")

    if company:
        clauses.append("company = ?")
        params.append(company)

    if property_type:
        clauses.append("property_type = ?")
        params.append(property_type)

    if penthouse:
        clauses.append("(unit_type LIKE '%enthouse%' OR tagline LIKE '%enthouse%')")

    sql = (
        "SELECT company, address, area, property_type, unit_type, beds, baths,"
        " price_per_bed_low, price_per_bed_high, price_total_low, price_total_high,"
        " price_note, availability, url, photo_url, availability_summary, tagline,"
        " description, amenities, lease_dates, utility_fees, brochure_url, lat, lng"
        " FROM listings"
    )
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)

    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row

    total = None
    if page_size is not None:
        count_sql = "SELECT COUNT(*) FROM listings"
        if clauses:
            count_sql += " WHERE " + " AND ".join(clauses)
        total = con.execute(count_sql, params).fetchone()[0]

    sql += " ORDER BY (beds IS NULL) ASC, beds ASC, price_per_bed_low ASC"
    query_params = list(params)
    if page_size is not None:
        sql += " LIMIT ? OFFSET ?"
        query_params += [page_size, ((page or 1) - 1) * page_size]

    rows = con.execute(sql, query_params).fetchall()
    con.close()

    def _to_listing(row: sqlite3.Row) -> dict:
        avail = row["availability"] or ""
        # Mirrors pipeline/ingest.py compute_is_available — substring match, not a
        # keyword list, so scraper-specific phrasings like MHM's "Available (LAST
        # UNIT)" or Smile's "Available now" all count.
        s = avail.lower()
        is_available = ("available" in s and "not available" not in s and "leased" not in s) \
            or "immediate move-in" in s or "move-in today" in s
        return {
            "company":              row["company"]              or "",
            "address":              row["address"]              or "",
            "unit_type":            row["unit_type"]            or "",
            "beds":                 row["beds"],
            "price_per_bed_low":    row["price_per_bed_low"],
            "price_per_bed_high":   row["price_per_bed_high"],
            "price_total_low":      row["price_total_low"],
            "price_total_high":     row["price_total_high"],
            "price_note":           row["price_note"]           or "",
            "availability":         avail,
            "is_available":         is_available,
            "area":                 row["area"]                 or "",
            "url":                  row["url"]                  or "",
            "lat":                  row["lat"],
            "lng":                  row["lng"],
            "photo_url":            row["photo_url"]            or "",
            "availability_summary": row["availability_summary"] or "",
            "tagline":              row["tagline"]              or "",
            "description":          row["description"]          or "",
            "amenities":            row["amenities"]            or "",
            "lease_dates":          row["lease_dates"]          or "",
            "utility_fees":         row["utility_fees"]         or "",
            "brochure_url":         row["brochure_url"]         or "",
            "property_type":        row["property_type"]        or "",
        }

    result: dict = {"listings": [_to_listing(r) for r in rows]}
    if total is not None:
        result["total"] = total
    return result


@app.post("/api/search")
def search(req: SearchRequest, _=Depends(verify_token)):
    # Step 1: extract structured filters from the NL query
    extracted = extract_filters(req.query)

    # Merge with explicit UI filters — explicit values win over NL-extracted ones
    explicit = req.filters.model_dump(exclude_none=True) if req.filters else {}
    merged   = merge_filters(extracted, explicit)

    # Step 2: build Chroma where clause from merged filters
    where = build_where(merged)

    # Step 3: metadata pre-filter + semantic re-rank
    docs = get_filtered_docs(req.query, where)

    # Step 3b: proximity filter — drop listings outside 0.5 mi of named landmark
    docs     = filter_by_location(docs, merged.get("location_hint"))
    listings = [doc.metadata for doc in docs]

    # Step 4: LLM writes a one-line summary (no listing selection)
    summary = summarize(req.query, listings, merged)

    return {
        "answer":          summary,
        "listings":        listings,
        "filters_applied": {k: v for k, v in merged.items() if v is not None},
    }


# [Step 3] Conversational chat endpoint — accepts history so extract_filters can resolve
# multi-turn references like "那附近" or "what about 2BR?"
class ChatRequest(BaseModel):
    conversation_id: str
    message: str
    history: list[dict] = []   # [{"role": "user"|"assistant", "content": str}]
    filters: FilterParams | None = None  # explicit UI filters; merged with NL-extracted ones


def _build_filter_prefix(explicit: dict) -> str:
    """Return a one-line filter summary prepended to every user message.
    Keeps the LLM aware of the current UI filter state so NL price/bed
    constraints from earlier turns don't bleed into new answers."""
    if not explicit:
        return ""
    BED_LABELS = {0: "Studio", 1: "1BR", 2: "2BR", 3: "3BR", 4: "4BR", 5: "5BR+"}
    parts = []
    if "property_type" in explicit:
        parts.append(f"type={explicit['property_type']}")
    if "beds" in explicit:
        beds = explicit["beds"]
        bed_list = beds if isinstance(beds, list) else [beds]
        parts.append("beds=" + "+".join(BED_LABELS.get(b, f"{b}BR") for b in bed_list))
    if "max_price_per_bed" in explicit:
        buf = explicit.get("buffer_type", "percent")
        val = explicit.get("buffer_value")
        suffix = f"+{val}%" if buf == "percent" and val else (f"+${val}" if buf == "fixed" and val else " exact")
        parts.append(f"max_price=${explicit['max_price_per_bed']}/bed{suffix}")
    if "availability_window" in explicit:
        parts.append(f"availability={explicit['availability_window']}")
    if "company" in explicit:
        parts.append(f"source={explicit['company']}")
    if not parts:
        return ""
    return f"[Active UI filters: {', '.join(parts)}]\n"


@app.post("/chat")
async def chat(req: ChatRequest, _=Depends(verify_token)):
    config = {"configurable": {"thread_id": req.conversation_id}}
    explicit = req.filters.model_dump(exclude_none=True) if req.filters else {}

    # Resolve the filters that housing_search will apply — deterministically, here,
    # rather than trusting the LLM to fill structured tool args (small models do that
    # unreliably across multi-turn context). Extract from this message + recent history,
    # then let explicit FilterPanel values win on conflict.
    nl_filters = extract_filters(req.message, req.history)
    search_filters = merge_filters(nl_filters, explicit)
    # A student who is actively searching wants places they can actually rent, so hide
    # fully-leased units by default. build_where gives an explicit availability_window
    # (e.g. "leased") precedence over this, so asking to see leased units still works.
    search_filters.setdefault("available_only", True)
    # A budget stated in conversation ("$1000–$1300") should be honored exactly. The
    # panel's default 15% buffer is meant to pad a price typed into the FilterPanel, not
    # a range the user spoke — so drop it when the price came from NL and the panel's own
    # price field is empty.
    nl_has_price = nl_filters.get("max_price_per_bed") is not None or nl_filters.get("min_price_per_bed") is not None
    if nl_has_price and explicit.get("max_price_per_bed") is None:
        search_filters["buffer_type"] = "exact"
        search_filters["buffer_value"] = None
    token = ui_filters.set(search_filters)

    # Prepend active filter state to every message so the LLM always knows the current
    # UI constraints — this overrides any price/bed constraints from earlier NL turns.
    filter_prefix = _build_filter_prefix(explicit)
    user_message = filter_prefix + req.message

    # Reuse one payload (and thus one HumanMessage id) across the retry below so a retry
    # never double-adds the user's turn to the checkpointed history.
    payload = {"messages": [HumanMessage(content=user_message)]}

    try:
        try:
            result = await agent.ainvoke(payload, config=config)
        except GroqBadRequestError as e:
            body = e.body if isinstance(e.body, dict) else {}
            code = (body.get("error") or {}).get("code")
            if code != "tool_use_failed":
                raise
            # Known Groq/Llama tool-calling reliability issue: the model's generation is
            # intermittently flagged as a failed tool call even when it wasn't attempting
            # one at all (see community.groq.com/t/tool-use-failed-on-llama4-models/427).
            # A same-request retry succeeds in most cases.
            result = await agent.ainvoke(payload, config=config)
        ui_filters.reset(token)

        # Trim old messages from the checkpointer so context stays within Groq's TPM limit.
        # Drop whole turns from the oldest end only — never split an AIMessage(tool_calls)
        # from its ToolMessage, or Groq rejects the next request with a 400 BadRequestError
        # ("assistant message with tool_calls must be followed by tool messages").
        # RemoveMessage deletes by ID — safe to call even if message count is below the cap.
        state = agent.get_state(config)
        stored = state.values.get("messages", [])
        if len(stored) > MAX_CHECKPOINTED_MESSAGES:
            turns: list[list] = []
            for m in stored:
                if isinstance(m, HumanMessage) or not turns:
                    turns.append([m])
                else:
                    turns[-1].append(m)
            while len(turns) > 1 and sum(len(t) for t in turns) > MAX_CHECKPOINTED_MESSAGES:
                turns.pop(0)
            kept_ids = {m.id for t in turns for m in t}
            to_drop = [m for m in stored if m.id not in kept_ids]
            if to_drop:
                agent.update_state(config, {"messages": [RemoveMessage(id=m.id) for m in to_drop]})

    except Exception as e:
        ui_filters.reset(token)
        import traceback
        traceback.print_exc()
        return {
            "answer":          f"Sorry, the assistant ran into an error: {type(e).__name__}. Please try again.",
            "listings":        [],
            "filters_applied": explicit,
        }

    answer = result["messages"][-1].content.strip()

    # Show the card grid whenever this turn actually ran housing_search.
    # The tool's artifact carries the matched listings; if the agent only
    # asked clarifying questions (no tool call), listings stays empty and
    # the UI shows a plain text reply. No in-band marker needed — emitting
    # one alongside a tool call triggers Groq's tool_use_failed (400).
    listings = []
    searched = False
    for msg in result["messages"]:
        if isinstance(msg, ToolMessage) and msg.name == "housing_search":
            listings = msg.artifact or []
            searched = True
            break

    # When a search actually ran, report the filters that were really applied
    # (NL-extracted + panel + the available-only default) so the results header
    # reflects reality instead of just the untouched FilterPanel. Otherwise fall
    # back to the panel state.
    filters_applied = (
        {k: v for k, v in search_filters.items() if v is not None}
        if searched else explicit
    )

    return {
        "answer":          answer,
        "listings":        listings,
        "filters_applied": filters_applied,
    }
