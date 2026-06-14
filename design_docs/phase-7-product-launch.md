# Phase 7 — Deployment & Product Launch

## Goal

Deploy the local stack (FastAPI + Next.js) to the cloud and ship to real UIUC students.

---

## Step 1 — Swap Ollama → NVIDIA API

Ollama runs as a local daemon and can't be hosted on Railway. Before deploying, swap the LLM in `rag/rag_chain.py` from `ChatOllama` to `ChatNVIDIA`.

**What to change:**
- In `rag/rag_chain.py`: replace the `ChatOllama` import and instantiation with `ChatNVIDIA` from `langchain-nvidia-ai-endpoints`
- In `config.py`: add `NVIDIA_MODEL = "meta/llama-3.1-8b-instruct"` and use `NVIDIA_API_KEY` from the environment
- In `.env`: add `NVIDIA_API_KEY=nvapi-xxxxxxxxxx`

**Test locally first:** run `python -m rag.rag_chain` and confirm it returns answers using the NVIDIA model before touching Railway.

---

## Step 2 — Deploy FastAPI to Railway

#### 2.1 — Files needed at project root

`Procfile` (already created):
```
web: uvicorn backend.main:app --host 0.0.0.0 --port $PORT
```

`requirements.txt` (already exists) — make sure it includes `fastapi`, `uvicorn`, `langchain-nvidia-ai-endpoints`.

Commit and push before continuing.

#### 2.2 — Create Railway project

1. Go to [railway.app](https://railway.app) → sign in with GitHub
2. **New Project** → **Deploy from GitHub repo** → select this repo
3. Railway detects the `Procfile` and starts an initial deploy (will fail — env vars not set yet)

#### 2.3 — Set environment variables

In the Railway service dashboard → **Variables** tab:

| Key | Value |
|---|---|
| `NVIDIA_API_KEY` | `nvapi-xxxxxxxxxxxxxxxxxx` |

> **Note on embeddings:** `all-MiniLM-L6-v2` is cached locally in `~/.cache/huggingface/` but Railway doesn't have that cache. Do NOT set `TRANSFORMERS_OFFLINE=1` on Railway — let it download the model on first boot (~90 MB, cached after that).

#### 2.4 — Redeploy and verify

Go to **Deployments** tab → **Redeploy**. Watch logs — success looks like:
```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:XXXXX
```

Go to **Settings** → **Networking** → **Generate Domain** to get your public URL.

Test it:
```bash
curl -X POST https://<your-railway-url>/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "2 bedroom under $900"}'
```

---

## Step 3 — Deploy Next.js to Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project** → import from GitHub
2. Set **Root Directory** to `frontend/`
3. Add environment variable:
   ```
   NEXT_PUBLIC_API_URL=https://<your-railway-url>
   ```
4. Deploy — Vercel auto-deploys on every push to `main`

---

## Step 4 — Pre-Launch

- Talk to 5 UIUC students — show the app, ask what's missing or confusing
- Define a one-liner: *"AI-powered housing search for UIUC students — ask in plain English, get ranked results"*
- Tighten CORS in `backend/main.py`: change `allow_origins=["*"]` to your Vercel domain

---

## Step 5 — Distribution

- **r/UIUC** — post a "built this for housing season" thread
- **Facebook groups**: UIUC Housing, UIUC Class of 20XX, UIUC International Students
- **Discord**: UIUC CS Discord, major-specific servers

---

## Step 6 — Feedback Loop

- Track: how many queries? What does the system fail on?
- Iterate on prompt, retrieval quality, data freshness
- Document metrics (users, queries, pain points) — this is the resume story

---

## Resume Angle

*"Built an Agentic RAG application that aggregates UIUC housing listings and lets students search via natural language. Designed the retrieval pipeline with LangChain + Chroma, deployed on Railway + Vercel, and launched to the UIUC student community."*

---

## Checklist

- [ ] Step 1 — Swap Ollama → NVIDIA API, test locally
- [ ] Step 2 — Deploy FastAPI to Railway
- [ ] Step 3 — Deploy Next.js to Vercel, connect to Railway URL
- [ ] Step 4 — Pre-launch review
- [ ] Step 5 — Distribute to UIUC students
