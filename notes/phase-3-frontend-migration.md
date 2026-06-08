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

#### 5.1 — Add required files to the repo

Railway needs two files at the **project root** (not inside `backend/`):

**`Procfile`** — tells Railway how to start the server:
```
web: uvicorn backend.main:app --host 0.0.0.0 --port $PORT
```

**`requirements.txt`** — must already exist (it does). Make sure it includes:
```
fastapi
uvicorn
langchain-nvidia-ai-endpoints
langchain
chromadb
sentence-transformers
python-dotenv
```

Commit and push both files before continuing:
```bash
git add Procfile requirements.txt
git commit -m "add Procfile for Railway deployment"
git push origin main
```

#### 5.2 — Push your repo to GitHub (if not already)

Railway deploys from GitHub. If the repo isn't on GitHub yet:
```bash
# On github.com: create a new empty repo (no README, no .gitignore)
git remote add origin https://github.com/<your-username>/uiuc-housing-assistant-langchain-rag.git
git push -u origin main
```

#### 5.3 — Create a Railway project

1. Go to [railway.app](https://railway.app) → sign in with GitHub
2. Click **New Project** → **Deploy from GitHub repo**
3. Authorize Railway to access your GitHub account if prompted
4. Select the `uiuc-housing-assistant-langchain-rag` repo
5. Railway will detect the `Procfile` and start an initial deploy (it will fail — that's fine, you haven't set env vars yet)

#### 5.4 — Set environment variables

In your Railway project dashboard:

1. Click on the service (the box that appeared after step 5.3)
2. Go to the **Variables** tab
3. Add the following key/value pairs one at a time:

| Key | Value |
|---|---|
| `NVIDIA_API_KEY` | `nvapi-xxxxxxxxxxxxxxxxxx` |
| `TRANSFORMERS_OFFLINE` | `1` |

> `TRANSFORMERS_OFFLINE=1` tells HuggingFace to use the cached embedding model instead of trying to download it at startup. **Without this, Railway will fail** because the model isn't cached on their server — you'll need to remove this flag and let it download on first deploy (see note below).

**Note on the embedding model cache:** `all-MiniLM-L6-v2` is cached locally in `~/.cache/huggingface/` on your machine. Railway's server doesn't have that cache. Remove `TRANSFORMERS_OFFLINE=1` on Railway so it downloads the model on first boot (~90MB, happens once).

#### 5.5 — Trigger a redeploy

After setting env vars, go to the **Deployments** tab and click **Redeploy** (or push a new commit — Railway auto-deploys on every push to `main`).

Watch the deploy logs in real time. A successful deploy ends with:
```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:XXXXX
```

#### 5.6 — Get your Railway URL and test it

1. Go to the **Settings** tab → **Networking** → click **Generate Domain**
2. Railway gives you a URL like `https://uiuc-housing-assistant-langchain-rag-production.up.railway.app`
3. Test the endpoint with curl:

```bash
curl -X POST https://<your-railway-url>/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "2 bedroom under $900"}'
```

Expected response shape:
```json
{
  "answer": "Here are some 2-bedroom options under $900...",
  "listings": [
    { "address": "...", "beds": 2, "price_per_bed_low": 850, ... }
  ]
}
```

If you get a 200 with that shape, the backend is live. Copy the Railway URL — you'll need it for Step 6.

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
