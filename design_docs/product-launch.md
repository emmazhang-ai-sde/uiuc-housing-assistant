# Product Launch Plan

**Created: 2026-06-17**

This is a non-commercial portfolio project that scrapes publicly accessible housing data for UIUC students. Publishing it as a live website establishes ownership, demonstrates it is actively maintained, and makes it resume-ready. Local-only is not enough.

---

## 1. Build in Public

1.1 Start posting **before** the site is live — establishes a public timestamp on ownership and means an audience already exists on launch day.

1.2 **What to post:**
- Short progress posts on LinkedIn / Twitter showing the RAG pipeline, filter panel, card views, map, data sources
- One-liner for every post: *"AI-powered housing search for UIUC students — plain English queries, structured filters, real listings."*
- Frame it as a technical portfolio piece, not a commercial product

1.3 Link all posts back to each other on launch day so the journey is visible.

---

## 2. Deploy — Vercel (frontend) + Railway (backend)

### 2.1 Pre-deploy status

| Item | Status |
|------|--------|
| LLM: Groq (`LLM_PROVIDER=groq`) | ✅ Done — `rag_chain.py` already implemented |
| Chroma DB committed to repo | ✅ Done — `chroma_db/` un-ignored and committed |
| `TRANSFORMERS_OFFLINE=1` removed | ✅ Done — Railway downloads model on first boot |
| CORS reads `ALLOWED_ORIGINS` env var | ✅ Done — `backend/main.py` |
| `railway.toml` + `runtime.txt` | ✅ Done |
| Frontend `NEXT_PUBLIC_API_URL` env var | ✅ Ready |

### 2.2 LLM — Groq

2.2.1 **Why not Ollama in production:** Ollama is a local daemon that requires a persistent background process. Railway runs plain Linux containers — no persistent daemon support. A hosted LLM API is required.

2.2.2 **Provider comparison:**

| | Groq (recommended) | Ollama (local dev only) |
|---|---|---|
| Works in cloud | ✅ Yes | ❌ No |
| Works locally | ✅ Yes | ✅ Yes |
| Setup | Free API key (30 sec) | Install + pull model (~5 GB) |
| Cost | Free tier: 30 req/min, 14,400 req/day | Free; uses local CPU/RAM |
| Speed | Fast (Groq LPU) | Depends on hardware |

2.2.3 **Free tier fallbacks if quota runs out:**
- NVIDIA API (`meta/llama-3.1-8b-instruct`) — also has a free tier
- OpenAI GPT-4o-mini — cheapest paid option (~$0.15/M tokens)

2.2.4 **Local dev / GitHub users:** copy `.env.example` → `.env`, set `LLM_PROVIDER=groq` + `GROQ_API_KEY`. Ollama users: `ollama pull llama3.1:8b` instead.

### 2.3 Railway — FastAPI backend

2.3.1 **Create project:**
1. [railway.app](https://railway.app) → New Project → Deploy from GitHub repo → select this repo
2. Railway auto-detects `railway.toml` — no manual build config needed

2.3.2 **Set environment variables:**
> **Gotcha:** Variables are at the **service level**, not the project level. On the project homepage you see a card for your service (named after the repo) — click that card, then click the **Variables** tab. Many people stop at the project homepage and can't find Variables because they haven't clicked into the service yet.

| Variable | Value | Notes |
|----------|-------|-------|
| `GROQ_API_KEY` | `gsk_...` | [console.groq.com](https://console.groq.com) → API Keys |
| `LLM_PROVIDER` | `groq` | Activates ChatGroq in `rag_chain.py` |
| `ALLOWED_ORIGINS` | `*` | Temporary; tighten to Vercel URL in step 2.6 |

2.3.3 **Generate a public domain:**
- Service card → Settings → Networking → under **Public Networking**, click **Generate Domain**
- Format: `https://xxxx.up.railway.app`
- **Gotcha:** the URL shown in the Railway console sidebar (e.g. the internal dashboard link) is **not** the public API address. The real public domain is only under Settings → Networking → Public Networking. If you paste the wrong URL into `NEXT_PUBLIC_API_URL`, every frontend request will fail silently.

2.3.4 **Verify backend is live:**
```bash
# Health check
curl https://<railway-url>/api/status

# Search test
curl -X POST https://<railway-url>/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "2BR under $900"}'
```
- Expected: JSON with `answer` + `listings` array
- If 500 → service card → Deployments → View Logs
- First boot is slow (~60 s) — Railway downloads `all-MiniLM-L6-v2` (~90 MB)

2.3.5 **Chroma DB note:** Railway's filesystem resets on each deploy. `chroma_db/` is committed to the repo, so it is bundled automatically. After any local re-ingest, commit `chroma_db/` before pushing.

### 2.4 Vercel — Next.js frontend

2.4.1 **Create project:**
1. [vercel.com](https://vercel.com) → New Project → Import Git Repository → same repo
2. Configure Project:
   - **Root Directory:** change `.` → `frontend`
   - **Framework Preset:** auto-detected as Next.js — leave it
   - Build command / output directory: leave as defaults

2.4.2 **Set environment variables** (on the Configure Project screen):

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `https://<railway-url>` (no trailing slash) |

The `NEXT_PUBLIC_` prefix bakes the value into the browser bundle at build time — this is the only env var the frontend needs.

2.4.3 **Deploy and verify:**
- Click Deploy (~1–2 min) → open the Vercel URL → run a search query
- If the search spinner hangs: DevTools → Network → check for a failed `POST /api/search`
  - Most common causes: wrong `NEXT_PUBLIC_API_URL`, or CORS not yet configured
- Both Railway and Vercel auto-redeploy within ~2 min on every `git push` to `main`

### 2.5 Custom Domain (optional)

Register a domain (e.g. `uiuchousing.xyz`, ~$10/yr) and add it in Vercel → Project → Settings → Domains. Makes the project feel official; Vercel handles SSL automatically.

### 2.6 Tighten CORS

Once the Vercel URL is known, update `ALLOWED_ORIGINS` on Railway:

1. Service card → Variables tab → edit `ALLOWED_ORIGINS`
   - Before: `*`
   - After: `https://uiuc-housing-assistant.vercel.app`
2. Multiple domains (e.g. preview + production): comma-separated — `backend/main.py` splits on `,` automatically
3. Save → Railway auto-redeploys

Verify:
```bash
curl -I -X OPTIONS https://<railway-url>/api/search \
  -H "Origin: https://uiuc-housing-assistant.vercel.app" \
  -H "Access-Control-Request-Method: POST"
# Expected: Access-Control-Allow-Origin: https://uiuc-housing-assistant.vercel.app
```

---

## 3. User Authentication

### 3.1 Scope

3.1.1 Access restricted to `@illinois.edu` email addresses — keeps the user base relevant, reduces abuse, and aligns with the non-commercial scraping intent.

3.1.2 Both Clerk and Supabase Auth support email domain allowlisting natively in their dashboards — no custom code needed. Non-`@illinois.edu` signups are rejected at the auth layer before reaching the app.

### 3.2 Recommended stack: Clerk

3.2.1 **Clerk (recommended):** lowest-friction Next.js auth — hosted UI, React hooks (`useUser`, `useAuth`), FastAPI backend SDK for token verification.

3.2.2 **Alternative — Supabase Auth:** open source; includes a PostgreSQL database (needed for Priority 4 anyway). Good choice if you want auth + DB in one place.

### 3.3 What to implement

1. Restrict sign-up to `@illinois.edu` in the auth provider dashboard
2. Wrap the Next.js app in `<ClerkProvider>` (or Supabase equivalent); redirect unauthenticated users to sign-in
3. Show user avatar + logout button in the sidebar
4. Pass auth token to FastAPI on every `/api/search` request; FastAPI verifies before responding

---

## 4. Conversation History & Usage Limits

### 4.1 Usage cap: 50 queries/month

4.1.1 A student actively apartment-hunting might send 10–20 queries in an intense week — 50/month is generous while keeping LLM costs predictable.

4.1.2 When the limit is hit, the UI shows a clear message ("You've used all 50 searches this month. Resets July 1.") — no silent failures.

4.1.3 Counter resets on the 1st of each month (`usage` table, keyed by `YYYY-MM`).

### 4.2 Per-user query cache (dataset-version-aware)

4.2.1 If a user submits the same query they've asked before AND the dataset hasn't changed since, return the cached result — skips the pipeline and does **not** count against quota.

4.2.2 Cache validity is tied to the dataset version (`last_scraped` date from `snapshots/latest.txt`, already exposed via `/api/status`) — not to time. A new scrape invalidates the cache.

4.2.3 **Lookup logic per search:**
1. Get `current_version` = `last_scraped` from `latest.txt`
2. Query user's message history for exact match on query string
3. If match found and `dataset_version == current_version` → return cached `listings_json` + summary; skip pipeline; do not increment usage
4. Otherwise → run full pipeline; store result with `dataset_version = current_version`; increment usage counter

### 4.3 DB schema

```sql
users    (id, email, created_at)
sessions (id, user_id, created_at, title)
messages (id, session_id, role, content, listings_json, dataset_version, created_at)
usage    (id, user_id, month, query_count)   -- month as YYYY-MM
```

- `listings_json` — raw listing array per assistant turn; enables replaying past conversations without re-querying
- `dataset_version` — `last_scraped` date string at response time; used to validate cache hits
- `usage` — FastAPI checks before pipeline; returns `429` if `query_count >= 50`

### 4.4 Recommended stack

- **Supabase** — PostgreSQL + auth + storage in one; if using Supabase Auth (Priority 3), DB is already there
- **Railway PostgreSQL** — if staying fully within Railway; add a Postgres plugin to the existing project

### 4.5 What to implement

1. On each search: check message history for exact query match with matching `dataset_version` → return cached result if hit
2. On cache miss: check `usage` table; return `429` if `query_count >= 50` for current month
3. On successful pipeline run: write message pair to `messages` (with `dataset_version`); increment `usage.query_count`
4. On app load: fetch user's recent sessions; render in sidebar as a clickable history list
5. Show remaining monthly query count in sidebar footer (e.g. "32 / 50 searches left")

---

## 5. Bring Your Own API Key

### 5.1 What it looks like

5.1.1 A settings panel (or sidebar field) where the user selects a provider (Groq / OpenAI / NVIDIA) and enters their API key.

5.1.2 On search, the frontend passes the key + provider to FastAPI; the backend uses it for that request only and discards it immediately.

5.1.3 Groq is the recommended option for users: free tier, no billing required, fast, same Llama models as the default.

### 5.2 Security rules (non-negotiable)

5.2.1 **Never persist the key:**
- Store in React state (in-memory) only — never `localStorage`, `sessionStorage`, or DB
- Key disappears on tab close — intentional
- A DB breach or XSS attack cannot exfiltrate a key that was never written to disk

5.2.2 **Never log the key on the server:**
- FastAPI must not log request bodies — audit all middleware before launch
- Key is used for one LLM call, then discarded; must never appear in Railway logs

5.2.3 **Minimize server exposure:**
- HTTPS enforced by Vercel + Railway — mitigates MITM
- Add a Content Security Policy (CSP) header in Next.js to reduce XSS surface
- CORS locked to Vercel domain (step 2.6) — blocks cross-origin injection

5.2.4 **Risk by provider:**

| Provider | Financial risk if key stolen | Notes |
|---|---|---|
| Groq | None (free tier) | Worst case: quota abuse only |
| OpenAI | High (pay-per-token) | In-memory-only is non-negotiable |
| NVIDIA | Medium | Free credits; check billing terms |

### 5.3 Future architecture

The safest design has the browser call the LLM API **directly** — the key never touches our server. The RAG vector search still needs FastAPI, but the summarization LLM call could be client-side. This is a meaningful refactor; document here as the target architecture if the user base grows.

---

## 6. Distribution

6.1 Post to communities **on launch day** and link back to the build-in-public posts:
- **r/UIUC** — "built a housing search tool for UIUC students"
- **Facebook groups:** UIUC Housing, UIUC Class of 20XX, UIUC International Students
- **Discord:** UIUC CS Discord, major-specific servers

6.2 Frame every post around the student use case, not the tech stack — "find a 1BR near Siebel under $900" lands better than "RAG pipeline with Chroma".

---

## Checklist

- [ ] 1 — Start posting build progress publicly (LinkedIn / Twitter)
- [x] 2.2 — Groq LLM implemented; `.env.example` created; tested locally
- [ ] 2.3 — Deploy FastAPI to Railway; verify `/api/search`
- [ ] 2.4 — Deploy Next.js to Vercel; verify end-to-end search
- [ ] 2.5 — Register custom domain (optional)
- [ ] 2.6 — Tighten CORS: set `ALLOWED_ORIGINS` to Vercel domain
- [ ] 3 — Set up auth (Clerk or Supabase); restrict to `@illinois.edu`
- [ ] 4.3 — Create DB schema (users, sessions, messages, usage)
- [ ] 4.5.1–2 — Implement query cache + 50/month usage limit in FastAPI
- [ ] 4.5.3 — Wire message history storage on every search
- [ ] 4.5.4–5 — Sidebar: conversation history list + monthly quota display
- [ ] 5.1–5.2 — Add BYOK settings panel; enforce in-memory-only key storage
- [ ] 5.2.2 — Audit FastAPI logging; confirm request bodies never logged
- [ ] 5.2.3 — Add CSP header to Next.js
- [ ] 6 — Post launch to r/UIUC, Facebook groups, Discord
