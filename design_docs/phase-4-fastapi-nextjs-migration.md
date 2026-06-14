# Phase 3 Design Doc — FastAPI + Next.js Migration

**Status:** Draft  
**Author:** Shuyang Zhang  
**Date:** 2026-06-07

---

## Background

The current app runs entirely inside Streamlit (`app.py`), which bundles the frontend and backend into one Python process. This works fine for local development but blocks public deployment because:

1. Streamlit Cloud's free tier can't load HuggingFace embeddings + Chroma in memory
2. The LLM is Ollama (local process) — no cloud platform can host it without a GPU server ($50+/mo)
3. Streamlit's UI is not customizable enough for a portfolio-quality product

The goal of Phase 3 is to split the app into a proper frontend/backend architecture and swap the local LLM for an API-based one so the whole thing runs cheaply in the cloud.

---

## Goals

- Deploy a publicly accessible URL (not just localhost)
- Keep monthly cost under $10 for a student-scale project (~100 queries/day)
- Preserve all existing RAG logic (`rag/` directory untouched)
- Frontend looks portfolio-quality, not a default Streamlit skin

## Non-Goals

- Real-time listing updates (scraper scheduling is Phase 4)
- User accounts / saved searches
- Moving Chroma to a hosted vector DB (not needed at this scale)

---

## Architecture

### Before (Streamlit monolith)

```
Browser
  │
  │  HTTP (Streamlit WebSocket)
  ▼
┌─────────────────────────────────────────┐
│  app.py  (Streamlit)                    │
│                                         │
│  UI rendering + session state           │
│       │                                 │
│       ▼                                 │
│  rag/rag_chain.py  (LangChain)          │
│       │                                 │
│       ├── Chroma (local disk)           │
│       └── ChatOllama → llama3.1:8b      │
│           (Ollama process on localhost) │
└─────────────────────────────────────────┘
```

### After (FastAPI + Next.js, separated)

```
Browser
  │
  │  HTTPS
  ▼
┌──────────────────┐         ┌──────────────────────────────────────┐
│  Next.js         │  POST   │  FastAPI                             │
│  (Vercel)        │ /chat   │  (Railway)                           │
│                  │────────►│                                      │
│  - Chat UI       │         │  rag/rag_chain.py  (unchanged)       │
│  - Suggestion    │◄────────│       │                              │
│    buttons       │  JSON   │       ├── Chroma (local disk)        │
│  - Source table  │         │       └── ChatOpenAI-compatible API  │
└──────────────────┘         │           (DeepSeek / Step / etc.)  │
                             └──────────────────────────────────────┘
```

---

## Key Decisions

### 1. LLM: Ollama → External API

Ollama runs as a local daemon — no cloud platform can host it without a dedicated GPU server. Swap to any OpenAI-compatible API.

**Chosen: DeepSeek-V3** (via DeepSeek API or SiliconFlow)

Rationale:
- OpenAI-compatible interface → one-line change in `rag_chain.py`
- Strong instruction-following for formatting tasks (what this LLM actually does)
- Not a reasoning model (R1, o1) — housing search doesn't need chain-of-thought
- ~$0.001–0.002 per query at student-project volume

Code change (only two lines in `rag_chain.py`):

```python
# Before
from langchain_ollama import ChatOllama
llm = ChatOllama(model=LLM_MODEL)

# After
from langchain_openai import ChatOpenAI
llm = ChatOpenAI(model=LLM_MODEL, api_key=os.getenv("LLM_API_KEY"), base_url=os.getenv("LLM_BASE_URL"))
```

`config.py` additions:
```python
LLM_MODEL    = "deepseek-chat"
LLM_BASE_URL = "https://api.deepseek.com/v1"   # or SiliconFlow endpoint
```

### 2. Backend: Streamlit → FastAPI

The `rag/` directory stays completely untouched. FastAPI wraps it with one new file.

`backend/main.py`:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from rag.rag_chain import chain, retriever

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"])

@app.post("/chat")
async def chat(body: dict):
    question = body["question"]
    answer   = chain.invoke(question)
    docs     = retriever.invoke(question)
    sources  = [{"content": d.page_content, "metadata": d.metadata} for d in docs]
    return {"answer": answer, "sources": sources}
```

### 3. Frontend: Streamlit → Next.js

`frontend/` is already scaffolded. The UI needs:

- Chat message list (user + assistant bubbles)
- Text input at the bottom
- Suggestion buttons for fresh chat
- Source table (currently rendered by `render_summary` in Streamlit)

The existing `streamlit_ui/ui.py` CSS can be extracted and reused as Tailwind classes or a global CSS file in Next.js.

### 4. Chroma: stay local on the backend server

At 489 listings, Chroma's local disk files are ~10 MB. Moving to Pinecone or Supabase adds complexity with no benefit at this scale. The `chroma_db/` directory is committed to the repo or copied into the Railway deployment.

---

## File Changes Summary

| File | Action | Notes |
|---|---|---|
| `rag/rag_chain.py` | Edit 2 lines | Swap `ChatOllama` → `ChatOpenAI` |
| `config.py` | Add 2 vars | `LLM_BASE_URL`, rename to `LLM_API_KEY` |
| `backend/main.py` | Create | New FastAPI entry point |
| `app.py` | Archive / delete | Replaced by FastAPI + Next.js |
| `streamlit_ui/` | Keep for reference | CSS/HTML can be ported to Next.js |
| `frontend/` | Implement chat UI | Already scaffolded |
| `requirements.txt` | Add `fastapi`, `uvicorn` | Remove `streamlit` |

---

## Deployment

| Component | Platform | Cost |
|---|---|---|
| Next.js frontend | Vercel | Free |
| FastAPI backend | Railway | Free tier (~$0–5/mo) |
| LLM | DeepSeek API | ~$1–3/mo at 100 queries/day |
| Chroma | On Railway (disk) | Included |
| **Total** | | **~$1–5/mo** |

Railway's free tier gives 500 hours/mo — enough for a project that isn't running 24/7. If it needs to be always-on, the $5/mo Hobby plan covers it.

---

## Migration Phases

**Phase 3a — Swap the LLM (30 min)**
1. Add `LLM_BASE_URL` and `LLM_API_KEY` to `.env`
2. Edit `rag_chain.py` (2 lines)
3. Test locally with `python -m rag.rag_chain`

**Phase 3b — Add FastAPI backend (1–2 hrs)**
1. Create `backend/main.py`
2. Add `fastapi` + `uvicorn` to `requirements.txt`
3. Test: `uvicorn backend.main:app --reload`, call `/chat` with curl

**Phase 3c — Build Next.js chat UI (3–5 hrs)**
1. Implement chat page in `frontend/app/page.tsx`
2. Wire up `POST /chat` call
3. Render assistant message + source table
4. Port suggestion buttons from `app.py`

**Phase 3d — Deploy (1–2 hrs)**
1. Push backend to Railway (add env vars in dashboard)
2. Push frontend to Vercel (set `NEXT_PUBLIC_API_URL` to Railway URL)
3. Test end-to-end

---

## Open Questions

- **Streaming:** FastAPI supports SSE streaming (`StreamingResponse`), which would make the chat feel faster. Worth adding in Phase 3b if the latency feels slow.
- **LLM provider:** DeepSeek API requires a Chinese phone number for registration. SiliconFlow is a viable fallback with the same DeepSeek-V3 model and an OpenAI-compatible interface.
- **Chroma on Railway:** Railway's free tier uses ephemeral disk — the `chroma_db/` files reset on redeploy. Either commit `chroma_db/` to git (10 MB, acceptable) or add a build step that re-runs `ingest.py` on deploy.
