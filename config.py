import os
from dotenv import load_dotenv

load_dotenv()

# LLM provider — controlled by LLM_PROVIDER env var
#   "groq"   → ChatGroq (recommended; works locally and in cloud; requires GROQ_API_KEY)
#   "ollama" → ChatOllama (optional; local-only; requires Ollama daemon + pulled model)
LLM_MODEL      = "llama3.1:8b"   # used by Ollama; Groq uses "llama-3.1-8b-instant" directly

# Embeddings
EMBED_MODEL = "./models/all-MiniLM-L6-v2"

# Vector store
CHROMA_DIR = "./chroma_db"

# Snapshots
SNAPSHOTS_DIR = "./snapshots"

# Retrieval
K_SEMANTIC       = 50    # max candidates fetched after metadata pre-filter (Phase 6)
SCORE_GAP        = 0.5   # max allowed drop from the top result's score; raise to be more permissive
PRICE_FLEX_MARGIN = 0.15 # allow up to 15% over stated budget before hard cutoff (Phase 6)
