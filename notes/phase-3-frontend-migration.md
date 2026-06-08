# Phase 3 — Frontend Migration & Cloud Deployment

Goal: Replace Streamlit with Next.js (frontend) + FastAPI (Python backend), deploy Next.js on Vercel and FastAPI on Railway. Streamlit was used for rapid prototyping but can't be hosted on Vercel and isn't suitable for a real product.

---

## Final Architecture

```
User
 │
 ▼
Next.js  (Vercel)          ← frontend, chat UI, listing cards
 │
 │  POST /api/search  { query: "2BR under $900" }
 ▼
FastAPI  (Railway)         ← Python backend, RAG logic
 │
 ├── rag_chain.py          ← retriever + LangChain chain (unchanged)
 │
 └── NVIDIA API            ← hosted LLM, replaces local Ollama
```

---

## Why Each Change

| Change | Reason |
|---|---|
| Streamlit → Next.js | Vercel doesn't support Streamlit; `ui-design.html` becomes real React components |
| Streamlit → FastAPI | Need a REST API the frontend can call |
| Ollama → NVIDIA API | Can't run a local LLM on a cloud server |

---

## Step-by-Step Implementation

### Step 1 — Swap Ollama → NVIDIA API

**Install the package:**
```bash
pip install langchain-nvidia-ai-endpoints
```

**Update `rag/rag_chain.py`:**
```python
# Remove:
from langchain_ollama import ChatOllama
llm = ChatOllama(model=LLM_MODEL)

# Add:
from langchain_nvidia_ai_endpoints import ChatNVIDIA
llm = ChatNVIDIA(model=NVIDIA_MODEL, api_key=NVIDIA_API_KEY)
```

**Update `config.py`:**
```python
NVIDIA_MODEL = "meta/llama-3.1-8b-instruct"
```

**Update `.env`:**
```
NVIDIA_API_KEY=nvapi-xxxxxxxxxxxxxxxx
```

**Test:** Run `python -m rag.rag_chain` and confirm it returns answers using the NVIDIA model.

---

### Step 2 — Build the FastAPI Backend

Create `backend/main.py`:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from rag.rag_chain import chain, retriever

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten this to your Vercel domain before launch
    allow_methods=["POST"],
    allow_headers=["*"],
)

class SearchRequest(BaseModel):
    query: str

@app.post("/api/search")
def search(req: SearchRequest):
    answer = chain.invoke(req.query)
    docs   = retriever.invoke(req.query)
    listings = [doc.metadata for doc in docs]
    return { "answer": answer, "listings": listings }
```

**Run locally to test:**
```bash
pip install fastapi uvicorn
uvicorn backend.main:app --reload
# → http://localhost:8000/api/search
```

**Test the endpoint:**
```bash
curl -X POST http://localhost:8000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "2BR under $900"}'
```

---

### Step 3 — Set Up Next.js Project

```bash
npx create-next-app@latest frontend --typescript --tailwind --app
cd frontend
```

Folder structure inside `frontend/`:
```
frontend/
├── app/
│   ├── page.tsx          ← main chat page
│   └── layout.tsx
├── components/
│   ├── ChatInput.tsx
│   ├── UserBubble.tsx
│   ├── AssistantMessage.tsx
│   ├── ListingCard.tsx
│   └── SummaryTable.tsx
└── lib/
    └── api.ts            ← fetch wrapper for FastAPI
```

**`lib/api.ts` — the only file that talks to FastAPI:**
```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export async function search(query: string) {
  const res = await fetch(`${API_URL}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  })
  return res.json()  // { answer: string, listings: Listing[] }
}
```

---

### Step 4 — Port `ui-design.html` to React Components

`ui-design.html` is already the target design. Convert each section to a component:

| HTML section | React component |
|---|---|
| `.listing-card` | `ListingCard.tsx` |
| `.summary-wrap` table | `SummaryTable.tsx` |
| User message bubble | `UserBubble.tsx` |
| Assistant message + cards + table | `AssistantMessage.tsx` |
| Sidebar | `Sidebar.tsx` |
| Suggestion buttons grid | part of `page.tsx` |

Since `ui-design.html` already uses Tailwind class names, the CSS translates directly to Next.js (which uses Tailwind by default).

---

### Step 5 — Deploy FastAPI to Railway

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Point to this repo, select the `backend/` folder
3. Add environment variables in Railway dashboard:
   ```
   NVIDIA_API_KEY=nvapi-xxx
   ```
4. Add a `Procfile` in the project root:
   ```
   web: uvicorn backend.main:app --host 0.0.0.0 --port $PORT
   ```
5. Railway gives you a URL like `https://your-app.railway.app`

---

### Step 6 — Deploy Next.js to Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. Set root directory to `frontend/`
3. Add environment variable in Vercel dashboard:
   ```
   NEXT_PUBLIC_API_URL=https://your-app.railway.app
   ```
4. Deploy — Vercel auto-deploys on every push to `main`

---

## Checklist

- [x] Step 1 — Swap Ollama → NVIDIA API, test locally
- [ ] Step 2 — Build FastAPI `/api/search` endpoint, test with curl
- [ ] Step 3 — Create Next.js project, set up folder structure
- [ ] Step 4 — Port `ui-design.html` components to React + Tailwind
- [ ] Step 5 — Deploy FastAPI to Railway
- [ ] Step 6 — Deploy Next.js to Vercel, connect to Railway URL
