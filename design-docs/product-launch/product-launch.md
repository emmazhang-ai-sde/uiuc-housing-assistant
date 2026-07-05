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

## 1.5 Pre-Launch: Coming Soon Page & Beta Waitlist

### 1.5.1 Launch phases

| Phase | Who can access | When |
|-------|---------------|------|
| **Coming Soon** | No one — visitors see waitlist page only | Now → beta invite sent |
| **Private Beta** | ~30 invited students | After waitlist review |
| **Public Launch** | All students | After beta feedback |

**Waitlist is no longer @illinois.edu-only (changed 2026-07-05):** the Coming Soon page originally only accepted a NetID and appended `@illinois.edu` in the UI. That restriction has been dropped — the form now takes any full email address. This was a client-side-only restriction: the `waitlist` table has no domain check (§1.5.3), and `is_email_on_waitlist` / `restrict_signup_to_waitlist` (`design-docs/user-authentication.md` §5.5–5.6) only check table membership, not the email's domain — so no database or auth-hook changes were needed to support this. The original rationale (launch posts targeted UIUC-specific audiences on Xiaohongshu/Reddit) is in `design-docs/product-launch/audience-and-identity-strategy.md`, but is now historical — that doc and `design-docs/user-authentication.md` still describe the old @illinois.edu-only assumption and should be treated as stale on that point.

### 1.5.2 Coming Soon page — **Live**

File: `frontend/app/coming-soon/page.tsx`

**Versioning:** the page went through two versions on 2026-07-05. V1 (badge "Private Beta · Coming Soon", no remaining-spots line, no waitlist-count divider) is archived at `design-docs/product-launch/archive/coming-soon-page-v1.tsx` for reference only — it is not wired into the app and is not routed by Next.js. V2 is the version currently live in `page.tsx`, described below.

URL: `uiuc-housing-ai.com` (root `/`, when `LAUNCH_MODE=coming_soon` in Vercel)

Content (as built):
- Headline: **"AI-Powered Housing Search for UIUC Students"**
- Subheadline: "Search hundreds of real listings near campus using plain English — no filters, no scrolling, just ask."
- Badge: "Launching July 5 · Waitlist Only" — orange pill (`rgb(255, 95, 5)`, the page's accent color) with white text, no border
- Email input: `type="email"` free-text field (`emailInput` state) — accepts any address, not just `@illinois.edu` (see the note above §1.5.1)
- "Notify me" button → inserts full email into Supabase `waitlist` table via anon key
- Duplicate email: Postgres error code `23505` → treated same as success (shows success card, no red error)
- Success state: "You're on the list! We'll email {email} when beta opens."

Design: `bg-neutral-100`, white card with soft shadow, `#7B90A0` accent (Morandi).

**Remaining spots indicator:** the page assumes a fixed beta capacity of `WAITLIST_CAPACITY = 100` seats (a constant in `page.tsx`, not stored in Supabase). Remaining spots = `100 - totalCount`, where `totalCount` is the current row count of the `waitlist` table (fetched on page load, and again after a successful signup). The count is clamped to a minimum of 0 so the copy never goes negative once the waitlist fills past 100. This is a display-only signal — it does not block signups once the 100 seats are used up; the actual invite cutoff is a manual decision made when the beta list is reviewed (see 1.5.1).

Two social-proof lines sit above the form, in this order:
1. "🔥 N spots left for the beta." — orange (`rgb(255, 95, 5)`), `text-lg`, the larger/top line. Has its own `border-t border-black` divider above it, in a separate `<div>` from the "Why a waitlist?" section's divider further down the page. Spacing below the line (`pt-8`) matches that section's divider; spacing above (`mt-10` on top of the parent's `space-y-4` gap) is one extra line taller than that section's `gap-10`, by request.
2. "🍀 N UIUC students already on the waitlist!" — grass green (`#2d8a4e`, matches the "You're on the list" success color), `text-base`.

**Reddit contact (replaces old "Can't wait" section):** the bottom-of-page section that used to offer an EN/CN language toggle with a manual-search pitch ("Need housing before we launch? I'll search manually for you.") and a separate Xiaohongshu group-chat flow was removed. The `lang` state and both language branches are gone. In their place, a single English line keeps the original Reddit thread link: "Have any questions about the website? Feel free to DM me on Reddit." The Xiaohongshu contact flow (QR code, `@momo在coding` links) was dropped, not just hidden. See `design-docs/product-launch/archive/coming-soon-page-v1.tsx` for the pre-removal version.

Both share the same weight/underline treatment (`font-semibold underline underline-offset-2`); only size and color differ, and only render once `totalCount` has loaded.

### 1.5.3 Waitlist storage — Supabase `waitlist` table

Run in Supabase SQL Editor:
```sql
CREATE TABLE waitlist (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  email      text        UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated visitors) can add their email
CREATE POLICY "Public insert" ON waitlist
  FOR INSERT WITH CHECK (true);
```

The Coming Soon page uses the Supabase anon key to insert — no login required.

### 1.5.4 Access control via `LAUNCH_MODE` env var

`proxy.ts` (Next.js Edge Middleware) reads `LAUNCH_MODE`:

| Value | Unauthenticated user sees |
|-------|--------------------------|
| `coming_soon` | `/coming-soon` (waitlist page) |
| `live` | `/login` (normal auth flow) |

Authenticated users (invited beta testers) always reach the real app regardless of `LAUNCH_MODE`.

**Vercel env vars:**
- Now: `LAUNCH_MODE=coming_soon`
- When beta opens: change to `LAUNCH_MODE=live` → triggers auto-redeploy

> **Gotcha — use `LAUNCH_MODE`, not `NEXT_PUBLIC_LAUNCH_MODE`:**
> `NEXT_PUBLIC_` variables are baked into the client bundle at build time and are not reliably available in Next.js Edge Middleware (proxy.ts) at runtime. Regular server-side env vars (no prefix) are injected into the Edge Runtime by Vercel at request time and work correctly.

> **Gotcha — Vercel env var UI value vs note:**
> When adding an env var via Environments → Production → Add Environment Variable, there are two text fields: **Value** and **Note (Optional)**. The value (`coming_soon`) must go in the **Value** field. The Note field is just a label for your own reference — it is NOT the variable's value and will not be used.

> **Gotcha — Vercel env var location:**
> Environment Variables for a project are NOT in Team Settings. Go to: project page → Settings → Environments → click **Production** → scroll down to **Environment Variables** section → **Add Environment Variable**.

> **Gotcha — Supabase anon key format:**
> Supabase now shows two tabs on the API Keys page: "Publishable and secret API keys" (new `sb_publishable_...` format) and "Legacy anon, service_role API keys". The existing `@supabase/ssr` client (`createBrowserClient` / `createServerClient`) requires the **Legacy** JWT format (`eyJhbGci...`). Do not use the new `sb_publishable_...` key.

### 1.5.5 Beta invite flow

> See `design-docs/product-launch/audience-and-identity-strategy.md` for the sender-email timeline (founder's personal address now, product domain post-launch) and the account-model decision (open signup, UIUC email as a badge, not a gate).

1. Review waitlist in Supabase → `SELECT * FROM waitlist ORDER BY created_at`
2. Pick ~30 testers
3. In Supabase → Authentication → Users → **Invite user** (sends a magic link directly)
4. Beta tester clicks link → session created → lands on real app
5. Collect feedback for 1–2 weeks, fix issues
6. Set `LAUNCH_MODE=live` → public launch, and change the login page from Illinois-email-only to accepting other providers (Gmail first, Outlook etc. to be decided at that point)

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

### 2.5 Custom Domain

Domain: **`uiuc-housing-ai.com`** — registered on Cloudflare.

**How it was connected (2026-06-19):**

1. Vercel → project → Settings → Domains → enter `uiuc-housing-ai.com` → Add
2. Vercel showed "Invalid Configuration" and prompted to update DNS on Cloudflare
3. Clicked **DNS Records** tab → Vercel offered **Auto configure** (OAuth flow to Cloudflare)
4. Clicked **Authorize** → Vercel automatically added the required A record and CNAME to Cloudflare
5. DNS propagated within a few minutes; `uiuc-housing-ai.com` now serves the frontend

**Old Vercel subdomain:** `uiuc-housing-assistant-langchain-ra.vercel.app` was removed (not redirected — it had never been shared publicly).

Vercel handles SSL automatically. No manual DNS record entry was needed.

### 2.6 Tighten CORS

Once the custom domain is live, update `ALLOWED_ORIGINS` on Railway:

1. Service card → Variables tab → edit `ALLOWED_ORIGINS`
   - Before: `*`
   - After: `https://uiuc-housing-ai.com`
2. Multiple domains (e.g. preview + production): comma-separated — `backend/main.py` splits on `,` automatically
3. Save → Railway auto-redeploys

Verify:
```bash
curl -I -X OPTIONS https://<railway-url>/api/search \
  -H "Origin: https://uiuc-housing-ai.com" \
  -H "Access-Control-Request-Method: POST"
# Expected: Access-Control-Allow-Origin: https://uiuc-housing-ai.com
```

### 2.7 What actually happened — deployment troubleshooting log

This section documents every real issue hit during the first Railway + Vercel deployment, in order. Treat it as a companion to steps 2.3–2.6 so the next person deploying this project doesn't repeat the same debugging.

---

**Issue 1 — Can't find Variables tab on Railway**

Symptom: "Variables" doesn't appear anywhere on the Railway project page.

Root cause: Variables live at the **service level**, not the project level. The Railway project homepage shows a card for the service — you must click that card to enter the service view, where the Variables tab appears at the top alongside Deployments and Settings.

Fix: click the service card → Variables tab is now visible.

---

**Issue 2 — 502 on first deploy: Railway can't reach HuggingFace**

Symptom:
```
curl https://<railway-url>/api/status
→ {"code":502,"message":"Application failed to respond"}
```

Log output:
```
OSError: We couldn't connect to 'https://huggingface.co' to load the files,
and couldn't find them in the cached files.
```

Root cause: the `all-MiniLM-L6-v2` embedding model (~87 MB) is downloaded from HuggingFace on first boot via `HuggingFaceEmbeddings`. Railway's free tier cannot reach `huggingface.co` at container startup.

Fix: bundle the model into the repo so no network call is needed.

```bash
# copy model files (resolving symlinks) from local HuggingFace cache into repo
cp -rL ~/.cache/huggingface/hub/models--sentence-transformers--all-MiniLM-L6-v2/snapshots/<hash>/. \
       models/all-MiniLM-L6-v2/
```

Then update `config.py`:
```python
EMBED_MODEL = "./models/all-MiniLM-L6-v2"   # first attempt (relative path — didn't work, see Issue 4)
```

Commit and push `models/` + `config.py`.

Note: `model.safetensors` is 86.66 MB. GitHub warns about files over 50 MB but allows up to 100 MB — the warning is safe to ignore. Git LFS is not needed.

---

**Issue 3 — `git push` blocked by GitHub email privacy**

Symptom:
```
remote: error: GH007: Your push would publish a private email address.
error: failed to push some refs
```

Root cause: git commits recorded the real `sz94@illinois.edu` address. GitHub's email privacy protection blocks pushes that would expose a private email in a public repo.

Immediate fix: GitHub → Settings → Emails → uncheck **"Block command line pushes that expose my email address"** → push succeeds.

Better long-term fix (re-enable the protection and use a no-reply address for all future commits):
```bash
git config --global user.email "193357154+shuyangzhang-ai-sde@users.noreply.github.com"
```
Then re-enable the GitHub email privacy setting. The no-reply address appears in commit history instead of the real email.

---

**Issue 4 — Still 502 after bundling model: relative path not resolved**

Symptom: same HuggingFace OSError in logs even after bundling the model and changing `EMBED_MODEL` to `"./models/all-MiniLM-L6-v2"`.

Root cause: `transformers` / `sentence_transformers` didn't resolve the relative path correctly inside Railway's container. The library tried to treat the string as a HuggingFace model ID and fell back to the network.

Fix: use an absolute path derived from `config.py`'s own location, so it resolves correctly regardless of the working directory:

```python
# config.py
from pathlib import Path
_BASE_DIR = Path(__file__).parent
EMBED_MODEL = str(_BASE_DIR / "models" / "all-MiniLM-L6-v2")
```

On Railway this resolves to `/app/models/all-MiniLM-L6-v2`; locally it resolves to the correct path on disk. No environment-specific code needed.

---

**Issue 5 — Still 502 after absolute path fix: port mismatch**

Symptom: logs showed the app started and health check passed internally, but external curl still returned 502:
```
INFO: Uvicorn running on http://0.0.0.0:8080
INFO: 100.64.0.2:xxxxx - "GET /api/status HTTP/1.1" 200 OK
```
(Railway's internal health checker at `100.64.0.2` reached the app, but external traffic didn't.)

Root cause: when generating the Railway domain, port `8000` was entered in the UI. But Railway's `$PORT` env var was set to `8080` by the platform. The start command (`uvicorn ... --port $PORT`) bound the app to 8080, but Railway's proxy was forwarding external traffic to 8000 — so every external request was dropped.

Fix: Railway service → Settings → Networking → edit the public domain → change port from `8000` to `8080`.

After this change (no redeploy needed):
```bash
curl https://<railway-url>/api/status
→ {"last_scraped":"2026-06-17","listing_count":null,"property_count":null}  ✅
```

**Lesson:** the port entered when generating a Railway domain must match the port the app actually binds to (i.e. whatever `$PORT` resolves to). Check the startup logs to confirm which port uvicorn is using before setting the domain port.

---

**Vercel deployment — no issues**

Steps that worked first try:
1. [vercel.com](https://vercel.com) → New Project → Import Git Repository → this repo
2. Root Directory: `frontend` (must change from default `.`)
3. Framework Preset: auto-detected as Next.js — no change needed
4. Environment Variables → `NEXT_PUBLIC_API_URL` = `https://alluring-joy-production-a6f2.up.railway.app`
5. Environments: left as **All** (default — applies to Production, Preview, Development)
6. Deploy → live at `https://uiuc-housing-assistant-langchain-ra.vercel.app`

End-to-end search returned real listings on first try after locking CORS in step 2.6.

---

**Final live URLs (as of 2026-06-19)**

| Service | URL |
|---------|-----|
| Backend (Railway) | `https://alluring-joy-production-a6f2.up.railway.app` |
| Frontend | `https://uiuc-housing-ai.com` (custom domain via Cloudflare; old Vercel subdomain removed) |

---

## 3. User Authentication

Moved to a standalone doc: [`user-authentication.md`](./user-authentication.md) — Supabase
auth, `@illinois.edu` domain restriction, the launch login flow (6-digit email code +
waitlist gate, §4A — supersedes the older magic-link design), `proxy.ts` route protection,
FastAPI JWT verification, and env vars.

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
- [x] 1.5.2 — Coming Soon page implemented and live (`frontend/app/coming-soon/page.tsx`)
- [x] 1.5.3 — `waitlist` table created in Supabase with RLS + public insert policy
- [x] 1.5.4 — `LAUNCH_MODE=coming_soon` set in Vercel Production env vars
- [x] 1.5.4 — `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` added to Vercel (Legacy JWT format)
- [x] 1.5 — Coming Soon page live at `uiuc-housing-ai.com`; waitlist form working
- [x] 2.2 — Groq LLM implemented; `.env.example` created; tested locally
- [x] 2.3 — Deploy FastAPI to Railway; verify `/api/search`
- [x] 2.4 — Deploy Next.js to Vercel; verify end-to-end search
- [x] 2.5 — Custom domain `uiuc-housing-ai.com` live (Cloudflare + Vercel auto-configure)
- [x] 2.6 — Tighten CORS: set `ALLOWED_ORIGINS` to Vercel domain
- [ ] 3 — Set up Supabase Auth; restrict to `@illinois.edu`; wire `@supabase/ssr` in Next.js
- [ ] 4.3 — Create DB schema (users, sessions, messages, usage)
- [ ] 4.5.1–2 — Implement query cache + 50/month usage limit in FastAPI
- [ ] 4.5.3 — Wire message history storage on every search
- [ ] 4.5.4–5 — Sidebar: conversation history list + monthly quota display
- [ ] 5.1–5.2 — Add BYOK settings panel; enforce in-memory-only key storage
- [ ] 5.2.2 — Audit FastAPI logging; confirm request bodies never logged
- [ ] 5.2.3 — Add CSP header to Next.js
- [ ] 6 — Post launch to r/UIUC, Facebook groups, Discord
