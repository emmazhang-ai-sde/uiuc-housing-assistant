import os
import sqlite3
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from rag.rag_chain import extract_filters, merge_filters, build_where, get_filtered_docs, filter_by_location, summarize
from config import SNAPSHOTS_DIR

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten this to your Vercel domain before launch
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# Phase 6: explicit UI filters sent alongside the NL query
class FilterParams(BaseModel):
    beds: int | list[int] | None = None
    max_price_per_bed: int | None = None
    available_only: bool | None = None
    company: str | None = None
    buffer_type: str | None = None   # "percent" | "fixed" | "exact"
    buffer_value: float | None = None


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
def search(req: SearchRequest):
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
