import os
from dotenv import load_dotenv

load_dotenv()

# LLM — change LLM_MODEL here when swapping ChatOllama → ChatOpenAI for Phase 3
OPENAI_API_KEY  = os.getenv("OPENAI_API_KEY")
NVIDIA_API_KEY  = os.getenv("NVIDIA_API_KEY")
LLM_MODEL      = "llama3.1:8b"

# Embeddings
EMBED_MODEL = "all-MiniLM-L6-v2"

# Vector store
CHROMA_DIR = "./chroma_db"

# Data

DB_FILE = "green_street_listings.db"

# Retrieval
K_RESULTS  = 6    # max candidates fetched before gap filtering
SCORE_GAP  = 0.5  # max allowed drop from the top result's score; raise to be more permissive
