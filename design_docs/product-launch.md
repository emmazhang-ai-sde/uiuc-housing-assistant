# Product Launch Plan

## Context & Intent

This project scrapes publicly accessible housing data from company websites that permit scraping for non-commercial use. The intent is non-commercial: this is a portfolio project and a tool for UIUC students. However, ownership matters — a published website with an official link establishes that this project is mine, is live, and is actively maintained. Local-only is not enough.

---

## Priority 1 — Building in Public (Most Urgent)

Start documenting the build process publicly **before** the site is live. This establishes a timestamp on ownership, builds an audience, and makes the eventual launch more impactful.

### What to post

- Short posts on LinkedIn and/or Twitter/X showing progress: the RAG pipeline, filter panel, card/table views, data sources
- A one-liner for every post: *"AI-powered housing search for UIUC students — plain English queries, structured filters, real listings."*
- Frame it as a technical portfolio piece, not a commercial product

### Why now

Building in public before launch means the audience is already there on day one. It also creates a clear public record that this project existed and was built by you — relevant for both ownership and resume purposes.

---

## Priority 2 — Deployment (Published Website & Official Link)

Deploy the existing local stack to the cloud so there is a real, shareable URL.

### Step 2a — Swap Ollama → Groq Cloud API

**Why not Ollama on Railway?** Ollama is a local daemon — it runs as a background process on your laptop and serves models from local GPU/CPU. Railway gives you a plain Linux container; there's no way to install and run Ollama as a persistent service there. A hosted LLM API is required for any cloud deployment.

**Recommended: Groq** — free tier, no credit card required, no surprise bills. It runs `llama-3.1-8b-instruct` (the same model used locally), so pipeline behavior stays consistent. `ChatGroq` is a one-line swap from `ChatOllama` in LangChain. Groq's LPU hardware is also significantly faster than most cloud LLM APIs.

What to change in `rag/rag_chain.py`:
```python
# Before (local only)
from langchain_ollama import ChatOllama
llm = ChatOllama(model=LLM_MODEL)

# After (cloud deployment)
from langchain_groq import ChatGroq
llm = ChatGroq(model="llama-3.1-8b-instant", api_key=os.environ["GROQ_API_KEY"])
```

Add `GROQ_API_KEY` to Railway environment variables. Test locally first by setting the env var and running `python -m rag.rag_chain` before touching Railway.

Other options if Groq free tier runs out: NVIDIA API (`meta/llama-3.1-8b-instruct`, also has a free tier) or OpenAI GPT-4o-mini (paid, cheapest OpenAI option).

> **Note on embeddings:** `all-MiniLM-L6-v2` is cached locally but not on Railway. Remove `TRANSFORMERS_OFFLINE=1` for the deployed environment — Railway will download the model (~90 MB) on first boot and cache it.

### Step 2b — Deploy FastAPI to Railway

`Procfile` is already in place:
```
web: uvicorn backend.main:app --host 0.0.0.0 --port $PORT
```

1. Railway → **New Project** → **Deploy from GitHub repo**
2. Set environment variables: LLM API key, any others needed
3. Generate a public domain under **Settings → Networking**
4. Verify: `curl -X POST https://<railway-url>/api/search -d '{"query": "2BR under $900"}'`

### Step 2c — Deploy Next.js to Vercel

1. Vercel → **New Project** → import from GitHub, root directory = `frontend/`
2. Set `NEXT_PUBLIC_API_URL=https://<railway-url>`
3. Vercel auto-deploys on every push to `main`

### Step 2d — Custom Domain (Optional but Recommended)

A custom domain (e.g. `uiuchousing.xyz`) makes the project feel official and is cheap (~$10/year). Vercel supports custom domains natively.

### Step 2e — Tighten CORS

Once the Vercel URL is known, change `allow_origins=["*"]` in `backend/main.py` to the specific Vercel domain.

---

## Priority 3 — User Authentication

Add login and logout so the app knows who is using it — required for storing conversations per user and enforcing usage limits.

### UIUC students only

Access is restricted to `@illinois.edu` email addresses. This keeps the user base relevant, reduces abuse, and aligns with the non-commercial scraping terms (tool is for UIUC students, not the general public).

Both Clerk and Supabase Auth support email domain allowlisting natively in their dashboards — no custom code needed. Anyone who tries to sign up with a non-`@illinois.edu` address is rejected at the auth layer before they ever reach the app.

### Recommended approach: Clerk

Clerk is the lowest-friction auth solution for Next.js. It provides a hosted UI (sign-in, sign-up, user management), React hooks (`useUser`, `useAuth`), and a backend SDK for verifying tokens in FastAPI.

Alternative: **Supabase Auth** — open source, includes a database (which we need anyway for Priority 4), good if we want everything in one place.

### What to implement

- Restrict sign-up to `@illinois.edu` domain in the auth provider dashboard
- Wrap the Next.js app in `<ClerkProvider>` (or Supabase equivalent)
- Add a sign-in/sign-up page; redirect unauthenticated users
- Show user avatar + logout button in the sidebar
- Pass the user's auth token to FastAPI on each `/api/search` request; FastAPI verifies it before responding

---

## Priority 4 — Conversation History Database

Store each user's search sessions and enforce a monthly query limit.

### Usage limit: 50 queries per month

Each user is capped at 50 searches per calendar month. Reasoning:
- A student actively apartment-hunting might send 10–20 queries in an intense week; 50 is generous
- The cap keeps LLM API costs predictable and protects against abuse
- The counter resets on the 1st of each month

When a user hits the limit, the UI shows a clear message ("You've used all 50 searches for this month. Resets on July 1.") rather than a silent failure.

### Per-user query caching (dataset-version-aware)

If a user submits the exact same query they've asked before, the app returns the stored result from their conversation history — **but only if the dataset hasn't been updated since that result was generated.** If a new scrape has run, the cache is invalidated and the pipeline runs fresh.

This is safe because cache validity is tied to the dataset version, not to time. The `last_scraped` date (already tracked in `snapshots/latest.txt` and exposed via `/api/status`) serves as the version key.

**Lookup logic on each search:**

1. Get `current_version` = today's `last_scraped` date from `latest.txt`
2. Query the user's message history for an exact match on the query string
3. If a match exists and its stored `dataset_version == current_version` → return the cached `listings_json` and summary; skip the pipeline and **do not count against the monthly quota**
4. Otherwise → run the full pipeline, store the result with `dataset_version = current_version`, increment the usage counter

A repeated query on a fresh dataset still counts as a new query (uses quota) since it triggers the full pipeline.

### Schema (simplified)

```sql
users        (id, email, created_at)
sessions     (id, user_id, created_at, title)
messages     (id, session_id, role, content, listings_json, dataset_version, created_at)
usage        (id, user_id, month, query_count)   -- month stored as YYYY-MM
```

`listings_json` stores the raw listing array returned per assistant turn, so past conversations can be replayed without re-querying.

`dataset_version` stores the `last_scraped` date string (e.g. `"2026-06-14"`) at the time the assistant response was generated. Used to determine whether a cached result is still valid.

`usage` tracks the running monthly count per user. FastAPI checks this before running the pipeline and returns a `429` if the limit is exceeded.

### Recommended stack

- **Supabase** (PostgreSQL + auth + storage in one) — if using Supabase Auth, the database is already there
- **Railway PostgreSQL** — if staying within Railway; add a Postgres plugin to the existing Railway project

### What to implement

- On each search: check message history for an exact query match with matching `dataset_version`; if found, return cached result without hitting the pipeline or incrementing usage
- On each search (cache miss): check `usage` table; reject with `429` if `query_count >= 50` for the current month
- On each successful pipeline run: increment `usage.query_count`; write the message pair to `messages` with the current `dataset_version`
- On load: fetch the user's recent sessions and render them in the sidebar as a history list
- Allow users to click a past session to restore the full conversation
- Show remaining queries for the month somewhere visible (e.g. sidebar footer)

---

## Priority 5 — API Integration (Bring Your Own API)

Allow users to supply their own LLM API key directly from the UI, so power users can use Groq, OpenAI, or any compatible provider without redeploying. Groq is the recommended default for users: free tier, no billing required, fast, and supports the same Llama models used locally.

### What this looks like

- A settings panel (or field in the sidebar) where the user selects a provider (Groq / OpenAI / NVIDIA / custom) and enters their API key
- On search, the frontend passes the key and provider to FastAPI; the backend uses it for that request only

### Security constraints (non-negotiable)

User-supplied API keys are a high-value target. The following rules must be followed without exception:

**Never persist the key anywhere:**
- Store the key in React state (in-memory) only — never write it to `localStorage`, `sessionStorage`, or the database
- The key disappears when the tab closes; this is intentional
- A database breach or XSS attack cannot exfiltrate a key that was never written to disk or DB

**Never log the key on the server:**
- FastAPI must not log request bodies — audit all middleware and logging config before launch
- The key arrives at the backend, is used for one LLM call, and is immediately discarded
- Railway log output must never contain the key string

**Minimize server exposure:**
- HTTPS everywhere (already enforced by Vercel and Railway) — mitigates man-in-the-middle
- Add a Content Security Policy (CSP) header in Next.js to reduce the XSS attack surface
- Tighten CORS to the Vercel domain only (already planned in Priority 2e) — prevents cross-origin requests from injecting calls

**Risk by provider:**

| Provider | Financial risk if key stolen | Notes |
|---|---|---|
| Groq | None (free tier, no billing) | Worst case: quota abuse only |
| OpenAI | High (pay-per-token) | In-memory-only is non-negotiable |
| NVIDIA | Medium | Free credits; check billing terms |

### Better architecture (future consideration)

The safest possible design is to have the browser call the LLM API **directly**, so the key never touches our server at all. The RAG vector search still needs the FastAPI backend, but the final summarization LLM call could happen client-side. This is a meaningful refactor and not required for launch — document it here as the target architecture if the user base grows.

---

## Distribution

Once the site is live:

- **r/UIUC** — "built a housing search tool for UIUC students" post
- **Facebook groups**: UIUC Housing, UIUC Class of 20XX, UIUC International Students
- **Discord**: UIUC CS Discord, major-specific servers
- Link back to the building-in-public posts to show the journey

---

## Checklist

- [ ] Priority 1 — Start posting build progress publicly (LinkedIn / Twitter)
- [ ] Priority 2a — Swap Ollama → Groq (`ChatGroq`, `llama-3.1-8b-instant`); test locally with GROQ_API_KEY
- [ ] Priority 2b — Deploy FastAPI to Railway; verify `/api/search`
- [ ] Priority 2c — Deploy Next.js to Vercel; verify end-to-end
- [ ] Priority 2d — Register custom domain (optional)
- [ ] Priority 2e — Tighten CORS to Vercel domain
- [ ] Priority 3 — Add user authentication (Clerk or Supabase Auth)
- [ ] Priority 3 — Restrict sign-up to @illinois.edu domain in auth provider dashboard
- [ ] Priority 4 — Set up database and schema (users, sessions, messages with dataset_version, usage)
- [ ] Priority 4 — Implement per-user query cache: exact match on query + dataset_version → return stored result, skip pipeline and quota
- [ ] Priority 4 — Implement 50 queries/month limit in FastAPI (check + increment usage table; return 429 on limit)
- [ ] Priority 4 — Show remaining monthly query count in sidebar
- [ ] Priority 4 — Wire conversation history into sidebar and chat UI
- [ ] Priority 5 — Add "Bring Your Own API" settings panel (provider selector + API key field)
- [ ] Priority 5 — Store key in React state only; confirm it never touches localStorage or DB
- [ ] Priority 5 — Audit FastAPI logging config; ensure request bodies (incl. API keys) are never logged
- [ ] Priority 5 — Add Content Security Policy header to Next.js
- [ ] Distribution — Post launch to r/UIUC, Facebook groups, Discord
