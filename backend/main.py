import os
import sqlite3
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from rag.rag_chain import chain, retriever, parse_json_output
from config import SNAPSHOTS_DIR

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten this to your Vercel domain before launch
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

class SearchRequest(BaseModel):
    query: str

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
    raw  = chain.invoke(req.query)
    try:
        data    = parse_json_output(raw)
        summary = data.get("summary", "")
    except Exception:
        summary = ""
    docs     = retriever.invoke(req.query)
    listings = [doc.metadata for doc in docs]
    return { "answer": summary, "listings": listings }