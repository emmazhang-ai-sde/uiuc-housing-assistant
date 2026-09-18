# Phase 3 — Frontend Migration & Cloud Deployment

## Motivation

Streamlit (Phase 2) was good for rapid prototyping but the UI kept being a bottleneck — layout control is limited, styling is opaque, and every UI detail requires working around Streamlit's constraints rather than just writing it. The goal of Phase 3 is to replace Streamlit with a proper React frontend so the UI can be built freely, and wrap the Python RAG logic in a FastAPI backend so the two can talk over HTTP.

Cloud deployment (Vercel + Railway) is a secondary goal — it comes after local is working end-to-end.

---

## Target Architecture

```
User
 │
 ▼
Next.js  (localhost:3102 locally / Vercel in prod)
 │
 │  POST /api/search  { query: "2BR under $900" }
 ▼
FastAPI  (localhost:3101 locally / Railway in prod)
 │
 ├── rag/rag_chain.py     ← retriever + LangChain chain (unchanged)
 │
 └── LLM: Ollama locally → NVIDIA API in prod
```

---

## What Was Built (Local)

### Backend — `backend/main.py`

Created a FastAPI app that wraps the existing RAG chain. It exposes a single endpoint `POST /api/search` which takes a `query` string and returns `{ answer, listings }`. CORS is enabled so the Next.js dev server can call it.

The backend imports directly from `rag/rag_chain.py` — no changes were needed to the RAG logic itself. `rag_chain.py` still uses Ollama + `llama3.1:8b` for local development. The NVIDIA API swap is deferred to the deployment step.

### Frontend — `frontend/`

Scaffolded with `create-next-app` (TypeScript, Tailwind, App Router).

**`lib/api.ts`** — the only file that talks to the backend. Defines the `Listing` and `SearchResponse` TypeScript types, and exports a `search(query)` function that POSTs to `NEXT_PUBLIC_API_URL/api/search`.

**Components** (all in `frontend/components/`):

| File | What it renders |
|---|---|
| `ListingCard.tsx` | One listing — address, unit type, price/bed, price total, availability badge, link |
| `SummaryTable.tsx` | All returned listings in a sortable comparison table. Beds and Price/mo total columns are clickable to toggle ascending/descending. Default sort: price ascending, null prices last. |
| `UserBubble.tsx` | A user message (right-aligned, 🌽 avatar) |
| `AssistantMessage.tsx` | An assistant turn — listing cards grid + summary table. Answer text is suppressed when listings are present; only shown as a fallback when the retriever returns nothing. |
| `Sidebar.tsx` | Left panel with app info, search tips, and a Clear Chat button |

**`app/page.tsx`** — the main chat page. Holds the message list in React state, handles form submission, calls `search()`, and renders the chat thread. Empty state shows a welcome screen with 4 suggested question buttons. Shows a "Searching listings…" placeholder while waiting for the backend.

**`app/layout.tsx`** — updated the page title and description from the default Next.js placeholder to "UIUC Housing Assistant".

**`app/globals.css`** — stripped down to just `@import "tailwindcss"`, removing the default Next.js dark mode variables.

**`frontend/.env.local`** — sets `NEXT_PUBLIC_API_URL=http://localhost:3101` so the frontend points to the local backend port.

---

## Local Dev Workflow

Two terminals required:

**Terminal 1 — Backend (FastAPI + Ollama)**
```bash
# Make sure Ollama is running first (brew services start ollama, or ollama serve)

cd /Users/shuyangzhang/RAG/uiuc-housing-assistant-langchain-rag
source .venv/bin/activate
uvicorn backend.main:app --reload --port 3101
# → http://localhost:3101/api/search
```

`frontend/.env.local` is set to `NEXT_PUBLIC_API_URL=http://localhost:3101`. If you change the port, update that file too.

**Terminal 2 — Frontend (Next.js)**
```bash
cd /Users/shuyangzhang/RAG/uiuc-housing-assistant-langchain-rag/frontend
npm run dev
# → http://localhost:3102
```

**Terminal 3 — Test the backend directly:**
```bash
curl -X POST http://localhost:3101/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "2BR under $900"}'
```

**When to restart vs. just refresh:**

| Changed | Action needed |
|---|---|
| `frontend/` TypeScript / CSS | Browser refresh (Next.js hot-reloads automatically) |
| `backend/main.py`, `rag/rag_chain.py`, `config.py` | Restart FastAPI (`--reload` handles this automatically) |
| Ran `pipeline/ingest.py` (Chroma updated) | Restart FastAPI — Chroma is loaded into memory at startup |

---

## Checklist

- [x] Build FastAPI `/api/search` endpoint (`backend/main.py`), verified with curl
- [x] Create Next.js project, set up folder structure
- [x] Build all React components and wire up `page.tsx`
- [x] Local full-stack verified: backend on :3101, frontend on :3102

Deployment → see `design_docs/phase-4-product-launch.md`
