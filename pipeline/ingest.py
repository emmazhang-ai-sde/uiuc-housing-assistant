# ingest.py
# Loads listings from green_street_listings.db → embeds text into Chroma vector store
#
# Run:    python -m pipeline.ingest   (from project root)
# Output: chroma_db/
#
# ⚠️  First run downloads the embedding model (~90 MB) — takes 2–5 min.
#     Subsequent runs are instant (model is cached locally).

from langchain_core.documents import Document
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
import sqlite3
from config import DB_FILE, CHROMA_DIR, EMBED_MODEL

# ── Load listings from SQLite ─────────────────────────────────────────────────
conn = sqlite3.connect(DB_FILE)
rows = conn.execute("""
    SELECT address, unit_type, beds,
           price_per_bed_low, price_per_bed_high,
           availability, area, url, text
    FROM listings
""").fetchall()
conn.close()
print(f"Loaded {len(rows)} listings from {DB_FILE}")

# ── Convert to LangChain Documents ───────────────────────────────────────────
# page_content = the pre-composed text chunk the model reads during retrieval
# metadata     = structured fields for filtering later in rag_chain.py
#                e.g. beds == 2, price_per_bed_high <= 900, availability != "Leased"
docs = [
    Document(
        page_content=row[8],  # text
        metadata={
            "address":            row[0],
            "unit_type":          row[1],
            "beds":               row[2],
            "price_per_bed_low":  row[3],
            "price_per_bed_high": row[4],
            "availability":       row[5],
            "area":               row[6],
            "url":                row[7],
        }
    )
    for row in rows
]

# ── Embed and store in Chroma ─────────────────────────────────────────────────
embeddings = HuggingFaceEmbeddings(model_name=EMBED_MODEL)

vectorstore = Chroma.from_documents(
    docs,
    embedding=embeddings,
    persist_directory=CHROMA_DIR
)

print(f"✅ Embedded {len(docs)} listings into Chroma → {CHROMA_DIR}")
