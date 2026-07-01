# User Authentication

**Created: 2026-06-29**

Supabase-based authentication for the app, restricting access to `@illinois.edu` email addresses. Extracted from [`product-launch.md`](./product-launch.md) §3.

> **Note (2026-06-29):** the magic-link login flow (§7.5–§7.6 below) has been superseded for launch by an **8-digit email code** plus a **waitlist membership gate** — see the **Launch Design** section just below (§5). Sections 1–3, 6, and 7 remain current. The magic-link specifics in §4, §7.5, and §7.6 are kept for reference only.

---

## 1. Scope

1.1 Access restricted to `@illinois.edu` email addresses — keeps the user base relevant, reduces abuse, and aligns with the non-commercial scraping intent.

1.2 Both Clerk and Supabase Auth support email domain allowlisting natively in their dashboards — no custom code needed. Non-`@illinois.edu` signups are rejected at the auth layer before reaching the app.

## 2. Clerk vs Supabase Auth

| | Clerk | Supabase |
|---|---|---|
| Next.js integration | Minimal — purpose-built for Next.js | Slightly more setup |
| `@illinois.edu` domain restriction | Supported | Supported |
| Needs a separate DB? | Yes (Priority 4 still needs a DB) | No — Auth + PostgreSQL bundled |
| Best when | Auth only | Auth + Priority 4 (history + quota) |

## 3. Recommended stack: Supabase

**Decision: Supabase.** Priority 4 (conversation history + usage quota DB) comes right after auth — Supabase bundles Auth + PostgreSQL in one service, avoiding a second provider.

**Supabase free tier:**

| Feature | Free tier | Our needs |
|---|---|---|
| Auth users | 50,000 Monthly Active Users (MAU) | A few hundred UIUC students |
| PostgreSQL | 500 MB | Conversation history, tens of MB |
| Bandwidth | 2 GB/month | Fine |
| Projects | 2 free projects | Fine |

Auth is free with no upgrade required.

## 4. Auth method: Magic Link (passwordless)

> **Superseded for launch (2026-06-29):** the login flow has moved from magic links to an **8-digit email code** plus a **waitlist membership gate** — see §5 below. §7.5–§7.6 describe the original magic-link page/callback and are kept for reference only.

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

## 5. Launch Design — Waitlist Gate + Email Code Login (current, 2026-06-29)

This is the login/logout flow we are actually shipping for beta. Access is restricted to people whose email is on the Supabase `waitlist` table, and login uses an **8-digit code emailed to the user** instead of a magic link.

### 5.1 Decisions (resolved 2026-06-29)

- **D1 — Gate strength:** ship **both** the RPC gate (§5.3) and the "Before User Created" Auth Hook (§5.6). The hook is the server-side source of truth; the RPC is just for a nicer client error.
- **D2 — Primary login method:** **Magic Code first.** The normal `/login` flow sends an 8-digit email code, so it drops `emailRedirectTo` from `signInWithOtp` and verifies the code with `verifyOtp`. Keep `/auth/callback` (§7.6) active as a Magic Link fallback in case we need to re-enable link-based login later.
- **D3 — Email-domain check:** keep the `@illinois.edu` pre-filter as a cheap client-side check even though the waitlist is the real gate (the waitlist only ever holds `@illinois.edu` emails, so it's redundant but harmless and gives a faster error).
- **D4 — Session lifetime:** no forced logout on the current Supabase plan. The project is not on Supabase Pro, so **Time-box user sessions** cannot be modified. Current setting: **"Enforce a single session per user" is active**, and **Time-box user sessions = `0`**, which means users are not forced to re-authenticate on a fixed schedule. See §5.2.1.
- **D5 — Email sender:** start with **Resend** as Supabase custom SMTP (easiest setup; 100/day · 3,000/mo is ample for ~50 beta users). Swap to **SendPulse** when nearing ~700 weekly-active users — a ~10-min credential change, no app code. Inbound (a readable support inbox) is handled separately and optionally by **Cloudflare Email Routing**. See §5.7.

### 5.2 Why a code instead of a magic link

`signInWithOtp` sends either a magic link or a numeric code depending on the email template and whether `emailRedirectTo` is passed:

- Pass `emailRedirectTo` + a template with `{{ .ConfirmationURL }}` → magic link.
- Omit `emailRedirectTo` + a template with `{{ .Token }}` → 8-digit code, verified client-side with `verifyOtp`.

The code flow keeps the whole login on one page (better on mobile, no email-client app switching, no cross-device "I opened the link on my phone but I'm logged in on my laptop" problem). The trade-off is one extra field for the user to type.

### 5.2.1 Session lifetime — why passwordless ≠ "log in every time"

Entering a code creates a **persistent session**, not a one-time entry. After the code is verified once, Supabase stores an access token + refresh token in cookies; the refresh token silently renews the session in the background, so the user stays signed in across page loads, tab closes, and days — **without ever seeing the login screen again** — until the session is deliberately expired.

So users do **not** fetch a new code every visit. On the current Supabase plan, users are not forced to re-authenticate on a fixed schedule:

- **Time-box user sessions = `0`** — no fixed session timebox. This cannot be changed without Supabase Pro.
- **Enforce a single session per user = active** — a new login replaces the user's previous active session, but it does **not** create a scheduled logout.
- **Access token (JWT) expiry = `3600s` (1 hour, default)** — short-lived *by design*; it auto-refreshes, the user never notices. This is **not** the re-login interval. In the current Supabase dashboard UI, this appears to be a fixed default rather than a setting to manually change on the Sessions page.
- **OTP / code expiry = `3600s` (default)** — how long the emailed 8-digit code stays valid *before the user types it*. Separate from session length.

If we upgrade to Supabase Pro later, revisit whether to set **Time-box user sessions** to `168 hours` (7 days). Until then, the expected behavior is: users stay signed in until they explicitly sign out, lose/clear their session cookies, log in elsewhere and replace the old session, or Supabase invalidates the session for another reason.

### 5.3 Where the waitlist check happens

The gate must run **before** a code is sent, otherwise we'd email codes to strangers and create Supabase auth users for them.

**Do not expose the `waitlist` table for arbitrary reads.** The coming-soon page can `select count(*)`; we must not let the anon key dump every signup email. A Postgres function answers a yes/no question without returning rows (§5.5). The client calls `supabase.rpc("is_email_on_waitlist", { p_email: email })`.

Because `signInWithOtp` is callable directly with the public anon key (it's in the browser bundle), the RPC alone is only a UX gate. The Auth Hook in §5.6 is the real lock.

### 5.4 Login flow

```
┌─ Step "email" ───────────────────────────────────────────────┐
│                                                              │
| user types email                                             │
│   ↓ validate it ends in @illinois.edu (cheap client check)   │
│   ↓ rpc is_email_on_waitlist(email)                          │
│      ├─ false → error: "This email isn't on the beta         │
│      │          waitlist." + link to /coming-soon            │
│      └─ true  → signInWithOtp({ email,                       │
│                   options: { shouldCreateUser: true } })     │
│                 (no emailRedirectTo → code, not link)        │
│   ↓ on success, advance to Step "code"                       │
│                                                              │
├─ Step "code" ────────────────────────────────────────────────┤
│                                                              │
│ user types 8-digit code                                      │
│   ↓ verifyOtp({ email, token: code, type: "email" })         │
│      ├─ error → "Invalid or expired code." (allow retry)     │
│      └─ session created → router.replace("/")                │
│ + "Resend code" (re-runs signInWithOtp) and                  │
│   "Use a different email" (back to Step "email")             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Differences from the §7.5 magic-link page:
- `signInWithOtp` **drops** `emailRedirectTo`, **adds** `shouldCreateUser: true`.
- New `verifyOtp({ email, token, type: "email" })` call.
- Page becomes a two-step state machine (`step: "email" | "code"`).

New login page — see [`frontend/app/login/page.tsx`](../frontend/app/login/page.tsx) (replaces §7.5).

### 5.5 Supabase RPC — `is_email_on_waitlist`

`SECURITY DEFINER` lets it read the table regardless of RLS, but it only ever returns a boolean — the email list never leaves the database.

```sql
create or replace function public.is_email_on_waitlist(p_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.waitlist
    where lower(email) = lower(trim(p_email))
  );
$$;

revoke all on function public.is_email_on_waitlist(text) from public;
grant execute on function public.is_email_on_waitlist(text) to anon, authenticated;
```

Verify (SQL Editor — substitute real values):

```sql
select public.is_email_on_waitlist('someone@illinois.edu');  -- expect: true
select public.is_email_on_waitlist('stranger@gmail.com');     -- expect: false
```

### 5.6 Supabase "Before User Created" Auth Hook

The server-side source of truth (D1). Run the function:

```sql
create or replace function public.restrict_signup_to_waitlist(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare addr text := lower(event->'user'->>'email');
begin
  if not exists (select 1 from public.waitlist where lower(email) = addr) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'This email is not on the beta waitlist.'
      )
    );
  end if;
  return event;
end;
$$;
```

Then enable it: **Authentication → Hooks → "Before User Created"** → select the Postgres function `restrict_signup_to_waitlist` → Save.

> ⚠️ The Hooks page wording and the error-return format vary by Supabase version. If the dashboard has no "Before User Created" hook, **stop and reassess** rather than guess — the fallback is the RPC gate alone (still ships D1's UX gate, minus the hard lock).

### 5.7 Supabase email template — embed the code

**Authentication → Email Templates → "Magic Link"** must include the token, or the user gets a link with no code. Set the body to:

```html
<h2>Your UIUC Housing Assistant sign-in code</h2>
<p>Enter this code to finish signing in:</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
<p>This code expires in 1 hour. If you didn't request it, ignore this email.</p>
```

`{{ .Token }}` is the 8-digit code. (Default OTP expiry is 3600s; tune under Authentication → Providers → Email if desired.)

**Where to paste it (dashboard runbook):**

1. Open the Supabase project dashboard.
2. Left sidebar → **Authentication**.
3. Open **Email Templates** (newer UI: **Authentication → Emails → Templates**; older UI: **Authentication → Email Templates**).
4. In the row of template tabs (Confirm signup, Invite user, Magic Link, Change Email Address, Reset Password) → click **"Magic Link"**.
5. The **Message body** box shows the current HTML (defaults to `{{ .ConfirmationURL }}`).
6. Select all, delete it, and paste the HTML block above.
7. Click **Save** (bottom-right of the editor).

**Why the "Magic Link" tab specifically:** even though we send a code, `signInWithOtp` uses the Magic Link template under the hood. The difference is purely the placeholder — `{{ .ConfirmationURL }}` renders a clickable link, `{{ .Token }}` renders the 8-digit code. Swapping in `{{ .Token }}` makes the same template deliver a code. Don't create a new template — edit the existing Magic Link one.

> **Note:** the editor preview won't show a real code — `{{ .Token }}` is only filled in when an actual email is sent. You'll see the real 8 digits when you test login.

### 5.7.1 Email infrastructure — custom SMTP (outbound) + inbound _(decision pending)_

**Why this surfaced:** the dashboard shows *"email templates are locked until custom SMTP is configured."* Two consequences:

1. **Template edit is blocked.** Supabase only allows editing the subject/body once a custom SMTP provider is connected. Without it every email uses Supabase's default template (a magic *link*, not a code) — so §5.7's code flow can't ship.
2. **The built-in sender is test-only.** Supabase's default email service is rate-limited to a few emails/hour and is explicitly not for production. On launch, most beta users wouldn't receive their code. A real sender is a genuine launch prerequisite.

**Two distinct needs** (they can be served by one vendor or split):

- **Outbound** — Supabase auth code emails. Requires SMTP credentials pasted into Supabase (Authentication → SMTP Settings). Also lets us reply *from* `support@<domain>`.
- **Inbound** — users emailing suggestions / feature requests to e.g. `hello@<domain>`, delivered to a personal inbox (Gmail).

**Free-tier options compared:**

> **Free-only shortlist.** Paid or no-usable-free-tier options were dropped to keep this focused: **AWS SES** (free only for the first 12 months, then pay-as-you-go), **Zoho ZeptoMail** (trial credit only), **Zoho Mail** (no SMTP on the free plan), **Google Workspace** (no free tier), **Forward Email** (sending is paid). What remains is genuinely free. Numbers shift often — verify on each provider's live pricing page before committing.

The login flow itself only needs **outbound** (sending the auth code). Inbound is a separate want; the table below marks both so you can pick a dual-purpose vendor.

| Service | Outbound | Inbound | Free volume | Daily cap | Notes |
|---|---|---|---|---|---|
| **SendPulse** | ✅ | ❌ | 12,000/mo | none | Highest free send; **no inbound**. |
| **Brevo** | ✅ | ⚠️ paid | ~9,000/mo | 300/day | Inbound parse is a paid feature. |
| **Mailjet** | ✅ | ✅ parse API | 6,000/mo | 200/day | Both — inbound = webhook parse. |
| **Resend** | ✅ | ✅ webhook | 3,000/mo | 100/day | Easiest setup; inbound = webhook. **← chosen (D5)** |
| **SendGrid** | ✅ | ✅ parse webhook | 3,000/mo | 100/day | Both; inbound = webhook. |
| **MailerSend** | ✅ | ✅ inbound routing | 3,000/mo | none | Most turnkey inbound; account approval. |
| **Cloudflare Email Routing** | ❌ | ✅ forward → inbox | $0, no cap | n/a | Free readable inbound (forwards to Gmail); **not a sender**. |

> **"Inbound" means two different things — pick by which you actually want:**
> - **Readable support inbox** (you want to *read* `support@<domain>` in Gmail): use **Cloudflare Email Routing** — free, unlimited, zero code. The "✅ inbound" on the transactional vendors does **not** give you this.
> - **Programmatic inbound** (your app processes incoming mail, e.g. parsing replies): the ✅-inbound vendors POST each received email to a **webhook you build**. It's not a mailbox you can open — it's an API. MailerSend's "inbound routing" is the most turnkey of these.
>
> For a contact/support address, Cloudflare is almost always what you want, and it pairs with *any* outbound sender. A single vendor "doing both" only helps if you specifically need programmatic inbound.

**Sizing for the 2,000-user goal.** Current sessions are not time-boxed (D4), so auth email volume should be lower than a forced weekly login model. For conservative capacity planning, assume a future 7-day timebox or weekly re-authentication pattern:

- per user: 30.4 / 7 ≈ **4.3 emails/month**
- 2,000 users: ≈ **8,700/month**, averaging **~286/day**; peaks (weekday clustering, multi-device, retries) → plan for **~500–600 on a heavy day**

So a free tier must clear **~10,000/mo** and not choke on a ~500–600/day spike. Against that, **only SendPulse (12,000/mo, no daily cap) clears it among free options.** Brevo is borderline (monthly tight, 300/day fails on peaks); the 3,000/mo tier (Resend/SendGrid/MailerSend) caps out near ~700 weekly-active users — fine for beta, not for the goal.

**Decision (D5): start with Resend** for outbound (Supabase custom SMTP). At ~50 beta users its 100/day · 3,000/mo ceiling is plenty, and it has the easiest Supabase setup. **Swap to SendPulse** (12,000/mo, no daily cap) when approaching ~700 weekly-active users — a ~10-minute change, zero app code.

- **Inbound (if/when wanted) → Cloudflare Email Routing** — forward `support@<domain>` to a personal Gmail. Free, unlimited, never touches the send quota, and works alongside Resend. (Resend can also do *programmatic* inbound via webhook, but Cloudflare is simpler for a readable support inbox — see the inbound note above.)

> **Not locked in:** the SMTP provider is just credentials pasted into Supabase — swapping it later is a ~10-minute change with **zero app code** (re-verifying the domain is the only cost).

**Domain:** the project owner already controls the launch domain (`uiuc-housing-ai.com`), so Resend's domain verification (~15 min of DNS records) and any Cloudflare inbound routing can proceed directly. The concrete Resend → Supabase SMTP setup is in §6.3.

### 5.8 Route protection update

The §7.4 `proxy.ts` stays, with two launch-specific public paths: whitelist `/coming-soon`, and keep `/auth/callback` public as the Magic Link fallback route (§7.6):

```ts
const isPublic =
  path.startsWith("/login") ||
  path.startsWith("/auth/callback") ||
  path.startsWith("/coming-soon")
```

**Limitation:** the waitlist check happens only at login. A user removed from the waitlist *after* logging in keeps their session until it expires. Acceptable for beta. To gate live traffic too, `proxy.ts` could re-check `is_email_on_waitlist(user.email)` — deferred.

### 5.9 Logout

As in §7.7: sidebar footer shows the signed-in email + a "Sign out" button that calls `supabase.auth.signOut()` then `router.replace("/login")`.

## 6. Supabase dashboard runbook (operator checklist)

This is the actionable, do-it-now version of §5.5–§5.7. It happens in the Supabase dashboard (cannot be done from code). Five operator items.

### 6.1 Create the waitlist-check function (RPC)

Dashboard → **SQL Editor** → New query → paste and **Run**:

```sql
create or replace function public.is_email_on_waitlist(p_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.waitlist
    where lower(email) = lower(trim(p_email))
  );
$$;

revoke all on function public.is_email_on_waitlist(text) from public;
grant execute on function public.is_email_on_waitlist(text) to anon, authenticated;
```

Quick test (same SQL editor) — swap in a real email you know is on your waitlist:

```sql
select public.is_email_on_waitlist('someone@illinois.edu');  -- expect: true
select public.is_email_on_waitlist('stranger@gmail.com');     -- expect: false
```

### 6.2 Create the Auth Hook function (the hard server-side lock)

In the SQL Editor, run:

```sql
create or replace function public.restrict_signup_to_waitlist(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare addr text := lower(event->'user'->>'email');
begin
  if not exists (select 1 from public.waitlist where lower(email) = addr) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'This email is not on the beta waitlist.'
      )
    );
  end if;
  return event;
end;
$$;
```

Then turn it on: dashboard → **Authentication → Hooks** (sometimes under "Auth Hooks") → find **"Before User Created"** → enable it → select the Postgres function `restrict_signup_to_waitlist` → Save.

> ⚠️ The exact wording of the Hooks page and the error-return format can vary by Supabase version. If the dashboard doesn't show a "Before User Created" hook option, stop here and flag it — we'll fall back to the RPC gate alone rather than guess. Don't force it.

### 6.3 Set up Resend + connect it to Supabase as custom SMTP (D5)

This unlocks template editing (§6.4) and is required to send codes. Three parts:

#### 6.3.1 Resend account + verify the domain
1. Sign up at [resend.com](https://resend.com) (free, no card).
2. **Domains → Add Domain** → enter a sending subdomain, recommended **`send.uiuc-housing-ai.com`** (a subdomain keeps the apex domain's email reputation separate). Pick a region close to users (US East).
3. Resend shows a set of **DNS records to add** — typically an **MX** record (bounce handling), an **SPF** `TXT` (`v=spf1 include:amazonses.com ~all`), and a **DKIM** `TXT` (`resend._domainkey…`). Copy them **exactly as Resend displays** (values are generated per-domain — don't hand-type from memory).
4. Add those records at the domain's DNS host, then back in Resend click **Verify**. Propagation is usually minutes (can take up to a few hours). Optionally add a `_dmarc` `TXT` (`v=DMARC1; p=none;`) for deliverability.

#### 6.3.2 Get SMTP credentials
- Resend → **API Keys → Create API Key** (Sending access). Copy the `re_…` key (shown once).
- Resend's SMTP endpoint: **host `smtp.resend.com`**, **port `465`** (TLS), **username `resend`**, **password = the `re_…` API key**.

#### 6.3.3 Paste into Supabase
- Supabase dashboard → **Authentication → Emails → SMTP Settings** → enable **Custom SMTP**:
  | Field | Value |
  |---|---|
  | Sender email | `noreply@send.uiuc-housing-ai.com` (must be on the verified domain) |
  | Sender name | `UIUC Housing Assistant` |
  | Host | `smtp.resend.com` |
  | Port | `465` |
  | Username | `resend` |
  | Password | your `re_…` API key |
- Save. The "Set up custom SMTP to edit templates" lock disappears once this is accepted.
- *(Optional)* **Authentication → Rate Limits** → raise "Emails per hour" above the tiny default now that a real sender is connected.

### 6.4 Put the code into the login email

Unlocked by §6.3.

Dashboard → **Authentication → Email Templates** → select **"Magic Link"** → replace the message body with:

```html
<h2>Your UIUC Housing Assistant sign-in code</h2>
<p>Enter this code to finish signing in:</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
<p>This code expires in 1 hour. If you didn't request it, ignore this email.</p>
```

The key part is `{{ .Token }}` — that's the 8-digit code. Save.

### 6.5 Session lifetime setting (D4)

No action for the current plan. The project is not on Supabase Pro, so **Time-box user sessions** cannot be modified.

Current dashboard state:

- **Enforce a single session per user = inactive**
- **Time-box user sessions = `0`**

Interpretation: `0` means there is no fixed forced-logout schedule. Users are not required to log in weekly; they stay signed in until they explicitly sign out, lose/clear their cookies, log in elsewhere and replace the old session, or Supabase invalidates the session for another reason.

Document **Access token (JWT) expiry** as the current Supabase default: `3600s` / 1 hour. In the current dashboard UI, this does not appear to be something we manually change from the Sessions page. This token still refreshes silently and is not the user-facing re-login interval; see §5.2.1.

---

## 7. Implementation steps

**Checklist (launch design — see §5 for rationale):**

1. **Supabase RPC** — create `is_email_on_waitlist` (§5.5). Verify in SQL editor.
2. **Supabase Auth Hook** — create + enable `restrict_signup_to_waitlist` (§5.6).
3. **Resend + custom SMTP** — verify the domain in Resend, paste SMTP creds into Supabase (§6.3) — this unlocks template editing.
4. **Supabase email template** — add `{{ .Token }}` to the Magic Link template (§6.4).
5. **Session lifetime** — document current non-Pro setting: single-session enforcement active, timebox fixed at `0` / no forced logout (§6.5).
6. **Login page** — rewrite `frontend/app/login/page.tsx` to the two-step code flow (§5.4).
7. **Route protection** — add `frontend/proxy.ts` (confirm filename against the installed Next.js per the §4 note), with `/coming-soon` and `/auth/callback` whitelisted (§5.8).
8. **Logout** — update `frontend/components/Sidebar.tsx` (§7.7).
9. **Keep magic-link callback fallback** — keep `frontend/app/auth/callback/route.ts` available, but do not use it in the primary Magic Code login flow (D2).
10. **Manual test** — waitlist email gets a code and logs in; non-waitlist email is rejected with the link to `/coming-soon`; logout returns to `/login`; unauthenticated access to `/` redirects to `/login`.

Steps 1–5 are dashboard work (done by the project owner). Steps 6–9 are code. The detailed per-step instructions follow.

### 7.1 Step 1 — Create Supabase project _(done: project `uknyhpwzvdevxfxkpxmy`)_

1. [supabase.com](https://supabase.com) → New Project; name `uiuc-housing-assistant`, region US East
2. **Project Settings → API Keys**

   Supabase's 2026 UI shows two API key tabs:

   | Tab | Use it? | Why |
   |---|---:|---|
   | **Publishable and secret API keys** | **No** | New `sb_publishable_...` / `sb_secret_...` keys. Do **not** use these with the current `@supabase/ssr` setup. |
   | **Legacy anon, service_role API keys** | **Yes** | Provides the classic `anon` JWT expected by `createBrowserClient` / `createServerClient`. |

   Copy these values:

   | Env var | Supabase location | Value to copy |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | **Project Settings → API Keys → Data API → API URL** | Project API URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Project Settings → API Keys → Legacy anon, service_role API keys** | `anon` / public key |
   | `SUPABASE_JWT_SECRET` | **Project Settings → API Keys → JWT Settings** | JWT Secret |

3. **Project Settings → API → Data API** — configure these three toggles:

   | Setting | Value | Why |
   |---|---|---|
   | Enable Data API | **ON** | `supabase-js` communicates with the database through this API; also needed for Priority 4 (conversation history) |
   | Automatically expose new tables | **OFF** | New tables are not exposed publicly by default — you grant access manually per table. More secure. |
   | Enable automatic RLS | **ON** | Row Level Security is auto-enabled on every new table. Users can only read their own rows — critical for Priority 4 `messages` and `usage` tables. |

### 7.2 Step 2 — Restrict sign-up to @illinois.edu _(skipped — handled in code)_

The Supabase dashboard "Restrict email domains" setting is skipped. Domain enforcement is done in two layers in code instead:

1. **Frontend validation (login page):** if the entered email is not `@illinois.edu`, the form blocks the request before it ever reaches Supabase.
2. **Server-side fallback (future, if needed):** a Supabase Auth Hook (database trigger) could enforce this at the API level for 100% server-side guarantee — not necessary for this project at current scale.

The only dashboard action needed here: **Authentication → Providers → Email** — confirm "Enable Email provider" ON and "Confirm email" ON.

### 7.3 Step 3 — Supabase client files

- [`frontend/lib/supabase/client.ts`](../frontend/lib/supabase/client.ts) — browser / Client Components (`createBrowserClient`).
- [`frontend/lib/supabase/server.ts`](../frontend/lib/supabase/server.ts) — server-side for Route Handlers and `proxy.ts` (`createServerClient` with cookie bridging).

### 7.4 Step 4 — `proxy.ts` (route protection)

[`frontend/proxy.ts`](../frontend/proxy.ts) — runs on every request. Unauthenticated users are redirected to `/login`. Also refreshes the Supabase session cookie so tokens stay valid. (Public-path whitelist is updated per §5.8.)

### 7.5 Step 5 — Login page

> **Superseded by §5.4** (code flow). The magic-link version is kept for reference.

See [`frontend/app/login/page.tsx`](../frontend/app/login/page.tsx) — magic link form, Morandi palette, centered card.

### 7.6 Step 6 — Auth callback route

| Login method | Current role | `signInWithOtp` setup | User action | Session creation | Route needed |
|---|---|---|---|---|---|
| **Magic Code** | Primary launch flow | Omit `emailRedirectTo`; email template uses `{{ .Token }}` | User copies the 8-digit code from email into `/login` | `/login` calls `verifyOtp({ email, token, type: "email" })` | No callback route needed |
| **Magic Link** | Fallback kept available | Pass `emailRedirectTo`; email template uses `{{ .ConfirmationURL }}` | User clicks the email link | [`frontend/app/auth/callback/route.ts`](../frontend/app/auth/callback/route.ts) exchanges the URL `code` for a session | Keep `/auth/callback` public in `proxy.ts` |

### 7.7 Step 7 — Sidebar: user email + logout

Changes to [`frontend/components/Sidebar.tsx`](../frontend/components/Sidebar.tsx):
- On mount: call `supabase.auth.getUser()` → store `user.email` in state
- Replace the existing "Clear chat" footer with a two-row footer:
  - Row 1: signed-in email (muted, `text-[#7B90A0]`, truncated)
  - Row 2: "Clear chat" + "Sign out" side by side
- "Sign out" calls `supabase.auth.signOut()` then `router.push("/login")`

### 7.8 Step 8 — Pass auth token to FastAPI

[`frontend/lib/api.ts`](../frontend/lib/api.ts) — `search()` gets an optional `token` param:
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

In [`frontend/app/page.tsx`](../frontend/app/page.tsx), before calling `search()`:
```ts
const supabase = createClient()
const { data: { session } } = await supabase.auth.getSession()
const res = await search(q, filtersSnapshot, session?.access_token)
```

### 7.9 Step 9 — FastAPI JWT verification

Add to [`requirements.txt`](../requirements.txt):
```
PyJWT==2.9.0
```

In [`backend/main.py`](../backend/main.py):
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

### 7.10 Step 10 — Environment variables

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
