# ingest.py
# Incremental Chroma update: reads latest snapshot → diffs vs existing vectors
# → adds new, updates changed, deletes removed. Unchanged listings are untouched.
#
# Run:    python -m pipeline.ingest   (from project root)
# Output: chroma_db/  (incrementally updated in place)

import hashlib
import json
import sqlite3
from pathlib import Path

from langchain_core.documents import Document
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from config import CHROMA_DIR, EMBED_MODEL, SNAPSHOTS_DIR


def listing_id(address: str, unit_type: str) -> str:
    """Stable document ID: MD5 of 'address|unit_type'."""
    return hashlib.md5(f"{address}|{unit_type}".encode()).hexdigest()


def compute_is_available(status: str) -> bool:
    """True if the availability string indicates the unit is currently available.
    Mirrors the frontend badge logic in ListingCard.tsx."""
    s = (status or "").lower()
    return "available" in s and "not available" not in s and "leased" not in s


def get_latest_db() -> Path:
    latest_file = Path(SNAPSHOTS_DIR) / "latest.txt"
    if not latest_file.exists():
        raise FileNotFoundError(
            "No snapshot found in snapshots/. Run pipeline.normalize_green_street first."
        )
    date_str = latest_file.read_text().strip()
    db_path  = Path(SNAPSHOTS_DIR) / f"listings_{date_str}.db"
    if not db_path.exists():
        raise FileNotFoundError(f"Snapshot DB not found: {db_path}")
    return db_path


def load_listings(db_path: Path) -> list[dict]:
    conn = sqlite3.connect(db_path)
    rows = conn.execute("""
        SELECT address, unit_type, beds,
               price_per_bed_low, price_per_bed_high,
               price_total_low,   price_total_high,
               availability, area, url, text, company,
               lat, lng, photo_url, availability_summary, tagline
        FROM listings
    """).fetchall()
    conn.close()
    return [
        {
            "address":              r[0],
            "unit_type":            r[1],
            "beds":                 r[2],
            "price_per_bed_low":    r[3],
            "price_per_bed_high":   r[4],
            "price_total_low":      r[5],
            "price_total_high":     r[6],
            "availability":         r[7],
            "area":                 r[8],
            "url":                  r[9],
            "text":                 r[10],
            "company":              r[11],
            "lat":                  r[12],
            "lng":                  r[13],
            "photo_url":            r[14],
            "availability_summary": r[15],
            "tagline":              r[16],
        }
        for r in rows
    ]


def main():
    db_path = get_latest_db()
    print(f"Loading from {db_path}")
    listings = load_listings(db_path)
    print(f"Loaded {len(listings)} listings")

    # Build {doc_id: (text, metadata)} for every listing in the new snapshot
    new_docs: dict[str, tuple[str, dict]] = {}
    for l in listings:
        doc_id = listing_id(l["address"], l["unit_type"])
        new_docs[doc_id] = (
            l["text"],
            {
                "company":            l["company"],
                "address":            l["address"],
                "unit_type":          l["unit_type"],
                "beds":               l["beds"],
                "price_per_bed_low":  l["price_per_bed_low"],
                "price_per_bed_high": l["price_per_bed_high"],
                "price_total_low":    l["price_total_low"],
                "price_total_high":   l["price_total_high"],
                "availability":       l["availability"],
                "is_available":       compute_is_available(l["availability"]),
                "area":               l["area"],
                "url":                l["url"],
                "lat":                l["lat"],
                "lng":                l["lng"],
                "photo_url":            l["photo_url"] or "",
                "availability_summary": l["availability_summary"] or "",
                "tagline":              l["tagline"] or "",
            },
        )

    embeddings  = HuggingFaceEmbeddings(model_name=EMBED_MODEL)
    vectorstore = Chroma(persist_directory=CHROMA_DIR, embedding_function=embeddings)

    # Fetch existing doc IDs, text, and metadata from Chroma
    existing_raw       = vectorstore._collection.get(include=["documents", "metadatas"])
    existing_texts     = dict(zip(existing_raw["ids"], existing_raw["documents"]))
    existing_metadatas = dict(zip(existing_raw["ids"], existing_raw["metadatas"]))
    existing_ids       = set(existing_texts.keys())
    new_ids            = set(new_docs.keys())

    to_delete: set[str]          = existing_ids - new_ids  # disappeared listings
    to_add_docs: list[Document]  = []
    to_add_ids:  list[str]       = []
    meta_update_ids:  list[str]  = []   # metadata-only changes (no re-embed needed)
    meta_update_vals: list[dict] = []

    for doc_id, (text, metadata) in new_docs.items():
        if doc_id not in existing_ids:
            # Brand-new listing
            to_add_docs.append(Document(page_content=text, metadata=metadata))
            to_add_ids.append(doc_id)
        elif existing_texts[doc_id] != text:
            # Text changed (price/availability reflected in text) — delete + re-embed
            to_delete.add(doc_id)
            to_add_docs.append(Document(page_content=text, metadata=metadata))
            to_add_ids.append(doc_id)
        elif existing_metadatas.get(doc_id) != metadata:
            # Metadata-only change (e.g. new field added) — update in place, no re-embed
            meta_update_ids.append(doc_id)
            meta_update_vals.append(metadata)
        # else: fully unchanged — skip

    unchanged = len(new_ids) - len(to_add_ids) - len(meta_update_ids)

    if not to_delete and not to_add_docs and not meta_update_ids:
        print("✅ Chroma is already up to date — nothing to do.")
        return

    if to_delete:
        vectorstore.delete(ids=list(to_delete))

    if to_add_docs:
        vectorstore.add_documents(to_add_docs, ids=to_add_ids)

    if meta_update_ids:
        vectorstore._collection.update(ids=meta_update_ids, metadatas=meta_update_vals)

    # Tally
    removed      = len(to_delete) - sum(1 for i in to_add_ids if i in to_delete)
    reembedded   = sum(1 for i in to_add_ids if i in existing_ids)
    added        = len(to_add_ids) - reembedded
    meta_updated = len(meta_update_ids)

    print(f"✅ Chroma updated → {CHROMA_DIR}")
    print(f"   Added         : {added}")
    print(f"   Re-embedded   : {reembedded}")
    print(f"   Metadata-only : {meta_updated}")
    print(f"   Removed       : {removed}")
    print(f"   Unchanged     : {unchanged}")


if __name__ == "__main__":
    main()
