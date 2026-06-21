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
| **Private Beta** | ~30 invited @illinois.edu students | After waitlist review |
| **Public Launch** | All @illinois.edu students | After beta feedback |

### 1.5.2 Coming Soon page — **Implemented**

File: `frontend/app/coming-soon/page.tsx`

URL: `uiuc-housing-ai.com` (root `/`, when `NEXT_PUBLIC_LAUNCH_MODE=coming_soon`)

Content (as built):
- Headline: **"AI-Powered Housing Search for UIUC Students"**
- Subheadline: "Search hundreds of real listings near campus using plain English — no filters, no scrolling, just ask."
- Badge: "Private Beta — Coming Soon"
- Email input: collects `@illinois.edu` addresses; front-end validates domain before submit
- "Notify me" button → inserts into Supabase `waitlist` table via anon key
- Duplicate email: catches Postgres error code `23505` → shows "You're already on the list!"
- Success state: "You're on the list! We'll email {email} when beta opens."

Design: `bg-neutral-100`, white card with soft shadow, `#7B90A0` accent (Morandi).

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

`proxy.ts` checks `NEXT_PUBLIC_LAUNCH_MODE`:

| Value | Unauthenticated user sees |
|-------|--------------------------|
| `coming_soon` | `/coming-soon` (waitlist page) |
| `live` | `/login` (normal auth flow) |

Authenticated users (invited beta testers) always reach the real app regardless of `LAUNCH_MODE`.

**Vercel env vars to set:**
- Now: `NEXT_PUBLIC_LAUNCH_MODE=coming_soon`
- When beta opens: change to `NEXT_PUBLIC_LAUNCH_MODE=live`

### 1.5.5 Beta invite flow

1. Review waitlist in Supabase → `SELECT * FROM waitlist ORDER BY created_at`
2. Pick ~30 testers
3. In Supabase → Authentication → Users → **Invite user** (sends a magic link directly)
4. Beta tester clicks link → session created → lands on real app
5. Collect feedback for 1–2 weeks, fix issues
6. Set `LAUNCH_MODE=live` → public launch

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

### 3.1 Scope

3.1.1 Access restricted to `@illinois.edu` email addresses — keeps the user base relevant, reduces abuse, and aligns with the non-commercial scraping intent.

3.1.2 Both Clerk and Supabase Auth support email domain allowlisting natively in their dashboards — no custom code needed. Non-`@illinois.edu` signups are rejected at the auth layer before reaching the app.

### 3.2 Clerk vs Supabase Auth

| | Clerk | Supabase |
|---|---|---|
| Next.js integration | Minimal — purpose-built for Next.js | Slightly more setup |
| `@illinois.edu` domain restriction | Supported | Supported |
| Needs a separate DB? | Yes (Priority 4 still needs a DB) | No — Auth + PostgreSQL bundled |
| Best when | Auth only | Auth + Priority 4 (history + quota) |

### 3.3 Recommended stack: Supabase

**Decision: Supabase.** Priority 4 (conversation history + usage quota DB) comes right after auth — Supabase bundles Auth + PostgreSQL in one service, avoiding a second provider.

**Supabase free tier:**

| Feature | Free tier | Our needs |
|---|---|---|
| Auth users | 50,000 Monthly Active Users (MAU) | A few hundred UIUC students |
| PostgreSQL | 500 MB | Conversation history, tens of MB |
| Bandwidth | 2 GB/month | Fine |
| Projects | 2 free projects | Fine |

Auth is free with no upgrade required.

### 3.4 Auth method: Magic Link (passwordless)

User enters `@illinois.edu` email → Supabase emails a sign-in link → user clicks → session created. No password to manage. Ideal for an occasional-use tool.

**Packages (already installed):**
```
# frontend (npm)
@supabase/supabase-js  @supabase/ssr

# backend (pip)
PyJWT==2.9.0   # verifies Supabase JWT tokens in FastAPI
```

**Next.js 16 note:** route protection uses `proxy.ts` at the project root, not `middleware.ts` (deprecated in v16).

---

### 3.5 Step 1 — Create Supabase project _(done: project `uknyhpwzvdevxfxkpxmy`)_

1. [supabase.com](https://supabase.com) → New Project; name `uiuc-housing-assistant`, region US East
2. **Project Settings → API Keys**

   > **Supabase new UI note (2026):** Supabase now shows two tabs on the API Keys page:
   > - **"Publishable and secret API keys"** — new `sb_publishable_...` / `sb_secret_...` format. Do NOT use these with `@supabase/ssr` — incompatible with existing `createBrowserClient` / `createServerClient` calls.
   > - **"Legacy anon, service_role API keys"** — the classic `anon` and `service_role` JWTs. Use these.

   From the **Legacy** tab:
   - **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **JWT Secret** (under Settings → JWT Settings) → `SUPABASE_JWT_SECRET`

   **Project URL:** Settings → API Keys page → scroll down to **Data API** section → **API URL** → `NEXT_PUBLIC_SUPABASE_URL`

3. **Project Settings → API → Data API** — configure these three toggles:

   | Setting | Value | Why |
   |---|---|---|
   | Enable Data API | **ON** | `supabase-js` communicates with the database through this API; also needed for Priority 4 (conversation history) |
   | Automatically expose new tables | **OFF** | New tables are not exposed publicly by default — you grant access manually per table. More secure. |
   | Enable automatic RLS | **ON** | Row Level Security is auto-enabled on every new table. Users can only read their own rows — critical for Priority 4 `messages` and `usage` tables. |

---

### 3.6 Step 2 — Restrict sign-up to @illinois.edu _(skipped — handled in code)_

The Supabase dashboard "Restrict email domains" setting is skipped. Domain enforcement is done in two layers in code instead:

1. **Frontend validation (login page):** if the entered email is not `@illinois.edu`, the form blocks the request before it ever reaches Supabase.
2. **Server-side fallback (future, if needed):** a Supabase Auth Hook (database trigger) could enforce this at the API level for 100% server-side guarantee — not necessary for this project at current scale.

The only dashboard action needed here: **Authentication → Providers → Email** — confirm "Enable Email provider" ON and "Confirm email" ON.

---

### 3.7 Step 3 — Supabase client files

**`frontend/lib/supabase/client.ts`** (browser / Client Components):
```ts
import { createBrowserClient } from "@supabase/ssr"

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**`frontend/lib/supabase/server.ts`** (server-side — Route Handlers, `proxy.ts`):
```ts
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(list) {
          list.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}
```

---

### 3.8 Step 4 — `proxy.ts` (route protection)

`frontend/proxy.ts` — runs on every request. Unauthenticated users are redirected to `/login`. Also refreshes the Supabase session cookie so tokens stay valid.

```ts
import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          list.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname
  const isPublic = path.startsWith("/login") || path.startsWith("/auth/callback")

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
}
```

---

### 3.9 Step 5 — Login page

`frontend/app/login/page.tsx` — magic link form, Morandi palette, centered card:

```tsx
"use client"
import { useState } from "react"
import { createClient } from "@/lib/supabase/client"

export default function LoginPage() {
  const [email, setEmail]   = useState("")
  const [sent, setSent]     = useState(false)
  const [error, setError]   = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.endsWith("@illinois.edu")) {
      setError("Only @illinois.edu emails are allowed.")
      return
    }
    setLoading(true); setError("")
    const supabase = createClient()
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })
    if (err) setError(err.message)
    else setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-100">
      <div className="bg-white rounded-3xl shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)] p-10 w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <span className="text-2xl">🏠</span>
          <div>
            <div className="font-bold text-neutral-900 text-[15px]">UIUC Housing Assistant</div>
            <div className="text-[10px] text-neutral-400 uppercase tracking-widest">Champaign-Urbana, IL</div>
          </div>
        </div>
        {sent ? (
          <div className="text-sm text-neutral-600 leading-relaxed">
            <p className="font-semibold text-neutral-900 mb-2">Check your inbox</p>
            <p>Sign-in link sent to <span className="font-mono text-[#7B90A0]">{email}</span>.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-neutral-500 uppercase tracking-widest block mb-2">
                Illinois email
              </label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="netid@illinois.edu" required
                className="w-full px-4 py-3 rounded-xl border border-neutral-200 text-sm placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#7B90A0]/40"
              />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-700 transition-colors disabled:opacity-50">
              {loading ? "Sending…" : "Send sign-in link"}
            </button>
            <p className="text-xs text-neutral-400 text-center">Only @illinois.edu addresses accepted.</p>
          </form>
        )}
      </div>
    </div>
  )
}
```

---

### 3.10 Step 6 — Auth callback route

`frontend/app/auth/callback/route.ts` — Supabase redirects here after the user clicks the magic link. Exchanges the one-time code for a session, then sends the user to `/`.

```ts
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }
  return NextResponse.redirect(`${origin}/`)
}
```

---

### 3.11 Step 7 — Sidebar: user email + logout

Changes to `frontend/components/Sidebar.tsx`:
- On mount: call `supabase.auth.getUser()` → store `user.email` in state
- Replace the existing "Clear chat" footer with a two-row footer:
  - Row 1: signed-in email (muted, `text-[#7B90A0]`, truncated)
  - Row 2: "Clear chat" + "Sign out" side by side
- "Sign out" calls `supabase.auth.signOut()` then `router.push("/login")`

---

### 3.12 Step 8 — Pass auth token to FastAPI

`frontend/lib/api.ts` — `search()` gets an optional `token` param:
```ts
export async function search(query: string, filters: Filters, token?: string): Promise<SearchResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers["Authorization"] = `Bearer ${token}`
  const res = await fetch(`${API_URL}/api/search`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, filters }),
  })
  ...
}
```

In `frontend/app/page.tsx`, before calling `search()`:
```ts
const supabase = createClient()
const { data: { session } } = await supabase.auth.getSession()
const res = await search(q, filtersSnapshot, session?.access_token)
```

---

### 3.13 Step 9 — FastAPI JWT verification

Add to `requirements.txt`:
```
PyJWT==2.9.0
```

In `backend/main.py`:
```python
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()
JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        jwt.decode(credentials.credentials, JWT_SECRET, algorithms=["HS256"],
                   audience="authenticated")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

# Apply to /api/search only:
@app.post("/api/search")
def search(req: SearchRequest, _=Depends(verify_token)):
    ...
```

`/api/status` stays public — no `Depends(verify_token)`.

---

### 3.14 Step 10 — Environment variables

**`frontend/.env.local`** (local dev — add these two lines):
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJh...
```

**Railway** (backend service → Variables tab):
```
SUPABASE_JWT_SECRET=<from Supabase → Project Settings → JWT Settings>
```

**Vercel** (frontend project → Settings → Environment Variables):
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJh...
```
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
- [x] 1.5.2 — Coming Soon page implemented (`frontend/app/coming-soon/page.tsx`)
- [ ] 1.5.3 — Create `waitlist` table in Supabase SQL Editor
- [ ] 1.5.4 — Set `NEXT_PUBLIC_LAUNCH_MODE=coming_soon` in Vercel env vars (Production environment)
- [ ] 1.5.4 — Add `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` to Vercel env vars (use Legacy tab in Supabase)
- [ ] 1.5 — Redeploy Vercel; verify waitlist form stores emails in Supabase
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
