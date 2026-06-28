import os
import sqlite3
import jwt
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from rag.rag_chain import extract_filters, merge_filters, build_where, get_filtered_docs, filter_by_location, summarize
from config import SNAPSHOTS_DIR


app = FastAPI()

_security   = HTTPBearer(auto_error=False)
_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
_DEV_MODE   = os.getenv("DEV_MODE", "false").lower() == "true"

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(_security)):
    if _DEV_MODE:
        return
    if not credentials:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        jwt.decode(
            credentials.credentials,
            _JWT_SECRET,
            algorithms=["HS256"],
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
    property_type: str | None = None  # "Apartment" | "House" | "Single Family Home"


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


@app.post("/chat")
async def chat(req: ChatRequest, _=Depends(verify_token)):
    extracted = extract_filters(req.message, history=req.history)
    merged    = merge_filters(extracted, {})
    where     = build_where(merged)
    docs      = get_filtered_docs(req.message, where)
    docs      = filter_by_location(docs, merged.get("location_hint"))
    listings  = [doc.metadata for doc in docs]
    summary   = summarize(req.message, listings, merged)
    return {
        "answer":          summary,
        "listings":        listings,
        "filters_applied": {k: v for k, v in merged.items() if v is not None},
    }
