# Open Registration (Remove the Waitlist Gate)

**Created: 2026-07-16**

**Builds on:** `design-docs/user-authentication.md` §5 (the waitlist gate this supersedes) · `design-docs/product-launch/audience-and-identity-strategy.md` (the long-term open account model)

**Status:** code implemented and verified (login UI committed to open signup + Google button, 2026-07-17). Going live needs one operator action: swap the server-side signup hook (see "What remains to flip"). Google one-click needs its provider config on top of that.

**Goal:** anyone with a real mainstream or school email can sign in and get an account on first login, no invite needed, while re-gating stays a single dashboard change away.

**Non-goals:** email campaigns to pending waitlist users (the founder sends those out of band); deleting the waitlist data or the coming-soon page file; school-affiliation verification badges.

## 1. Why this change

The beta launched invite-only: an email could only become an account if it was on the waitlist first. That was right for a controlled launch, but it caps growth at the speed the waitlist is groomed, and every new user costs a manual step. This change opens self-serve signup while keeping one safety property that matters: a real gate stays on the server, so bots cannot mint accounts just because the funnel opened, and re-gating never needs a code change.

Access control here is two independent layers that are easy to conflate:

- A **routing layer** decides what an anonymous visitor can see at all (marketing page only, or the login screen too). It is driven by deployment configuration and is not what blocks new users.
- An **identity layer** decides whose email may become an account. After this change it is enforced in two places: the login UI runs a fast domain pre-check so a wrong address fails instantly with a friendly message, and the auth service's pre-creation hook is the real, unbypassable gate. The client check is convenience; the hook is security.

Opening registration means changing what the identity layer's hook accepts; the routing layer only needs to know the product has launched.

## 2. The technical decisions, and why

### A. Who gets in: a domain allowlist, not a fully open door

Requirement: any real person can join without an invite, including prospective students who do not have a school address yet. Tension: a fully open door maximizes reach but hands the signup email sender to bots, and disposable-domain addresses are the cheapest way to mass-create junk accounts.

| Option | Reach | Abuse resistance |
|---|---|---|
| Fully open, any email | maximal | worst: disposable domains walk right in |
| School domains only | locks out prospective students, the core audience | best |
| Mainstream providers + school domains (chosen) | everyone with a normal mailbox | closes the disposable-domain vector |

Choice: accept five mainstream consumer providers (Gmail, Outlook.com, Yahoo, QQ, 163) plus any education domain. QQ and 163 are there deliberately: UIUC has a large Chinese student population, and prospective students who have not enrolled yet often use those instead of a school address. The education rule accepts both US-style school domains and international ones (like Chinese universities), and both kinds are registry-controlled, so an attacker cannot fake membership by putting "edu" inside a subdomain they own. Anyone on the old waitlist also always passes, whatever their domain, so nobody who could sign up before is locked out. Only the flagship Outlook domain is accepted, not its sibling legacy domains; the list is easy to widen later if a real user hits the wall, and widening is much cheaper than narrowing after abuse.

What the allowlist does not fix: someone can still type a stranger's real Gmail address and trigger an unwanted sign-in email. The auth provider's per-address and hourly rate limits remain the guard for that, and re-gating is the brake.

### B. Retire the waitlist UI outright; keep only the gate reversible

Requirement: be able to re-gate quickly if open registration goes badly. Tension: keeping the old waitlist login screen behind a flag would mean the frontend carries two versions of every login string and threads the launch mode into client components, just to preserve a screen a launched product should not be showing at all.

Resolution: split the two concerns. The **UI commits to open** — the waitlist login copy, the "join the waitlist" links, and public access to the waitlist page are removed outright, not hidden behind a flag. The **gate stays reversible**, but that reversibility lives entirely on the server (Decision C), not in a frontend mode. As a result the launch-mode config now only marks two states in code: the pre-launch lockout (`coming_soon`) versus launched. `live` and `open` are both "launched" and behave identically in every code path; which one is set is just a human-readable intent marker. The single thing that actually gates or opens registration is which hook the auth service runs.

Consequence accepted: an emergency re-gate (Decision C) restores the server gate but not a waitlist-styled login screen — a rejected user sees the open login card and gets the gate's error on submit, rather than a "join the waitlist" page. That is fine for a rare, temporary rollback and not worth carrying a second UI to avoid.

### C. The server-side gate is swapped, never switched off

Requirement: even with signup open, account creation must stay hard-gated on the server, because the client check is bypassable by design. Tension: the auth service's pre-creation hook runs inside the database and cannot see deployment configuration, so no code change can make it follow the launch mode on its own.

Choice: keep two gate rules side by side in the database, the old waitlist-membership rule and the new domain-allowlist rule, and let the auth dashboard choose which one the hook runs. Going open means pointing the hook at the allowlist rule; re-gating means pointing it back. Nothing is ever dropped and the server is never left ungated. Because the UI already committed to open (Decision B), this hook is now the entire gated-vs-open switch: go-live and rollback are each one dashboard change, no deploy.

### D. The waitlist page and data stay; only its entrances close

The coming-soon signup page file, its table, and its data are all kept: the data still powers cohort analytics and the founder's own outreach. What changes is reachability. Nothing links to the page anymore, and in every launched mode a direct visit to it redirects to the login page, so stale shared links land somewhere useful instead of on a dead funnel. The membership badge on the account page and the waitlist-conversion metric in the admin dashboard keep working unchanged; they now describe the original beta cohort rather than all users, which is still exactly the question they were built to answer.

## 3. What was done, and where

The frontend now presents open signup unconditionally (the waitlist login UI was removed, not flag-gated). The server-side gate and its rollback live in the database + auth dashboard.

| Where | What | New / Change | Status |
|---|---|---|---|
| `frontend/components/auth/LoginCard.tsx` | Redesigned to a clean open-signup card: Google button, "or" divider, email-code form, a domain-allowlist pre-check, and an accepted-providers hint. All waitlist copy and the "join the waitlist" link removed | Change | done 2026-07-17 |
| `frontend/app/auth/callback/route.ts` | Record the login analytics event on the OAuth/magic-link return path, tagged by provider | Change | done 2026-07-17 |
| `frontend/proxy.ts` | Routing keyed on pre-launch-vs-launched: `/login` public once launched; the waitlist page redirects to `/login` in every launched mode; only the pre-launch lockout still serves it | Change | done 2026-07-17 |
| `frontend/app/about/page.tsx` | Removed the "Join the Waitlist" footer link outright | Change | done 2026-07-17 |
| `frontend/components/UserMenu.tsx` | Show the logged-out "Log In" link in every launched mode; hide it only during the pre-launch lockout | Change | done 2026-07-17 |
| `frontend/app/robots.ts` | Crawlable in every launched mode; blocked only during the pre-launch lockout | Change | done 2026-07-17 |
| `scripts/admin-analytics-setup.sql` | Added the domain-allowlist gate as a second hook function (§5), side by side with the waitlist rule, never replacing it | **New** section §5 | done 2026-07-16 |
| `frontend/README.md` | Document the launch-mode values and that gating is now the hook's job, not the mode's | Change | done 2026-07-17 |
| `design-docs/user-authentication.md` | Superseded note under §5 pointing here, plus a warning that its embedded SQL snapshots are stale | Change | done 2026-07-16 |

What remains to flip (the actual go-live; reversible, exact clicks in the appendix):

| Where | What | Status |
|---|---|---|
| Supabase dashboard, auth hooks page | Point the "Before User Created" hook at the domain-allowlist rule (this is the whole gated-to-open switch) | pending |
| Google Cloud Console + Supabase providers page | Enable Google so the "Continue with Google" button works (§4); email-code login works without this | pending |

`LAUNCH_MODE` does not need to change to go open: the UI is already open and the hook is the gate. Leave it `live`, or set it to `open` as an intent marker; both behave identically. It only matters that it is not `coming_soon`.

## 4. Sign in with Google (code implemented 2026-07-17; provider config pending)

Once signup is open, the email-code flow is the product's front door, and it has two costs: every login consumes a send from the email quota, and typing an 8-digit code is the clunkiest sign-in pattern still in common use. A "Continue with Google" button fixes both for most of the audience: one click, no code, no email sent. It fits this campus unusually well, since student mailboxes are Google Workspace accounts, so the same button serves both personal Gmail and school addresses.

Decisions:

- **A second door, not a replacement.** The email-code flow stays for everyone without a Google account, which for this audience concretely means the QQ, 163, and Yahoo users the allowlist was widened for.
- **Same gate, no new gate code.** The server-side pre-creation hook runs for OAuth signups exactly as it does for email-code signups, so the domain allowlist holds with zero extra enforcement work. One rough edge accepted: a rejected domain (say a company's Google Workspace address) finds out after the Google round-trip rather than while typing, because the email is not known until Google hands it back.
- **It is free.** Google charges nothing for OAuth with basic identity scopes and requires no app-verification review for them; the auth provider includes social login on the current free plan. The only spend is setup time.
- **Analytics must not silently lose OAuth logins.** The email-code flow logs its login at the moment the code is verified. The Google flow returns through the redirect callback instead, so the login event is recorded there, tagged with the provider, so Google users are not invisible in the activity dashboard and the two methods can be told apart.

| Where | What | New / Change | Status |
|---|---|---|---|
| `frontend/components/auth/LoginCard.tsx` | "Continue with Google" button that starts the redirect | Change | done 2026-07-17 |
| `frontend/app/auth/callback/route.ts` | Log the login on the OAuth/magic-link return, tagged by provider | Change | done 2026-07-17 |
| Google Cloud Console | Create the OAuth client and consent screen that identify this app to Google | **New** | pending |
| Supabase dashboard, auth providers page | Enable Google sign-in with those credentials | **New** | pending |

The button is live in the UI, but Google login stays inert until the two provider-config rows are done: `signInWithOAuth({ provider: "google" })` returns an error until Google is enabled in Supabase, at which point the button starts working with no further deploy. The redirect return needed no new plumbing: the callback route kept as the magic-link fallback already performs the code-for-session exchange that OAuth uses, so the only code added there is the login logging. Exact console clicks, redirect URL, and scopes: appendix.

## Deliverable

The login page is a clean open-signup card: "Continue with Google", an "or" divider, and an email field that emails an 8-digit code, with a line naming the accepted providers and no waitlist language anywhere. A stranger with a Gmail, Outlook.com, Yahoo, QQ, 163, or school address, never waitlisted, can sign in and land in the app with a working account. An address outside the allowlist gets a clear error naming what is accepted, instantly in the UI and again from the server if the UI is bypassed. The waitlist page redirects to login and is linked nowhere. Pointing the hook back re-gates registration server-side. Local verification (type check, lint, production build) all passed; evidence in the appendix.

## Failures log

| Date | Symptom | Cause | Fix |
|---|---|---|---|
| - | nothing yet; fill during rollout | | |

## Risks and open notes

- **Emergency re-gate leaves open-styled UI.** Rolling the hook back to the waitlist rule restores the server gate, but the login card still reads as open signup (Decision B); rejected users see the gate error on submit rather than a waitlist page. Acceptable for a rare, temporary rollback.
- **Analytics coverage.** Cohort segmentation built on the waitlist table (`active-pending-users.md`) only describes the original waitlist cohort; open-signup users appear in the event log without a waitlist row. Acceptable for now; revisit if per-cohort reporting is ever needed.
- **Documentation drift.** The canonical auth doc still describes the waitlist gate as current; it carries a superseded note pointing here rather than a rewrite.
- **Relation to the audience strategy.** `audience-and-identity-strategy.md` envisioned open signup with school affiliation as a verified badge; this ships the open-signup half only, the badge remains future work.

## Appendix - build-time specifics (skip on a first read)

### Launch mode values

- Env vars: `LAUNCH_MODE` (server; read by `frontend/proxy.ts` and `frontend/app/robots.ts`) and `NEXT_PUBLIC_LAUNCH_MODE` (client; read by `UserMenu.tsx` only, to hide the Log In link pre-launch). `LoginCard.tsx` and `about/page.tsx` no longer read it.
- Values: `coming_soon` (pre-launch lockout: gated pages rewrite to `/coming-soon`, `/login` not public, site not crawlable) versus launched (anything else). `live` and `open` are both "launched" and behave identically in code; set `open` only as an intent marker. Gating is decided by the auth hook, not by this value.

### The domain allowlist

- Exact domains: `gmail.com`, `outlook.com`. Outlook sibling domains (`hotmail.com`, `live.com`, `msn.com`) are deliberately not allowed. Yahoo, QQ and 163 were allowed at launch and were removed on 2026-07-20; accounts already created on those domains keep working (the hook only runs before user creation), but the client pre-check would now block them at sign-in, so see the note below.
- Education rule: domain matches `\.edu(\.[a-z]{2})?$`, i.e. ends with `.edu` or `.edu.<country code>` (covers `illinois.edu` and e.g. `tsinghua.edu.cn`).
- Legacy pass: emails present in `public.waitlist` or `public.test` always pass.
- Defined twice, kept in sync by comment cross-references: `public.restrict_signup_to_allowed_domains` in `scripts/admin-analytics-setup.sql` §5 (the real gate) and `ALLOWED_EMAIL_DOMAINS` + `EDU_DOMAIN_RE` in `frontend/components/auth/LoginCard.tsx` (client pre-check only). The client check runs for everyone including existing users re-authenticating; today every existing account is `@illinois.edu` or a founder gmail, so none are locked out, but a future weird-domain waitlist account would need the client list widened even though the hook would pass it.

### SQL: the domain-allowlist hook function

Already in `scripts/admin-analytics-setup.sql` §5; idempotent, run in the Supabase SQL Editor:

```sql
create or replace function public.restrict_signup_to_allowed_domains(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  addr text := lower(event->'user'->>'email');
  addr_domain text := split_part(lower(event->'user'->>'email'), '@', 2);
begin
  if addr_domain in ('gmail.com', 'outlook.com')
     or addr_domain ~ '\.edu(\.[a-z]{2})?$'
     or exists (select 1 from public.waitlist where lower(email) = addr)
     or exists (select 1 from public.test where lower(email) = addr) then
    return event;
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Use a Gmail, Outlook.com, or school (.edu) email address.'
    )
  );
end;
$$;
```

### Go-live steps

1. Run the SQL above in the Supabase SQL Editor (creates the function; safe to re-run).
2. Supabase Dashboard → Authentication → Hooks → "Before User Created": change the Postgres function from `restrict_signup_to_waitlist` to `restrict_signup_to_allowed_domains`. Do not delete either function. This one change opens registration.
3. (Optional) Vercel → Environment Variables → Production: set `LAUNCH_MODE` / `NEXT_PUBLIC_LAUNCH_MODE` to `open` as an intent marker, then redeploy. Not required for correctness; skip if already a non-`coming_soon` value.
4. Smoke test: a fresh never-waitlisted `gmail.com` address gets a code and an account; a disallowed domain (e.g. `hotmail.com`) gets the allowlist error, both in the UI and when calling the auth API directly; visiting `/coming-soon` redirects to `/login`; admin analytics still exclude test accounts.

Rollback (re-gate): Supabase Dashboard → point the hook back at `restrict_signup_to_waitlist`. The login UI stays open-styled; rejected signups get the hook's 403 on submit.

### Google sign-in: remaining provider config (§4)

The code is done (button in `LoginCard.tsx`, login logging in the callback route). What remains is enabling Google as a provider so `signInWithOAuth` stops erroring:

1. Google Cloud Console → APIs & Services → OAuth consent screen: External, app name + support email, publish. Scopes: `openid`, `email`, `profile` only (no verification review needed for these).
2. APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback` (from Supabase → Authentication → Providers → Google, which displays the exact value).
3. Supabase Dashboard → Authentication → Providers → Google: enable, paste the client ID and secret.
4. Smoke test: personal Gmail one-click login works; `@illinois.edu` via the Google button works (Workspace account, passes the `.edu` rule); a custom-domain Workspace account is rejected by the hook after the round-trip; the login shows up once (not twice) in `/admin/activity`.

#### Google Cloud resources created (started 2026-07-19)

These are the external resources this feature owns in Google Cloud. Nothing here lives in the repo, so this table is the only record of what exists and what it was set to.

| Resource | Value / setting | Why it is this value | Status |
| --- | --- | --- | --- |
| OAuth consent screen, audience | **External** | Internal restricts login to a Google Workspace org's own members. The audience is any Gmail, Outlook, Yahoo, QQ, 163, or `.edu` address, so External is the only workable choice. | done 2026-07-19 |
| OAuth consent screen, publishing status | **In production** (not Testing) | External apps start in Testing, where only manually-listed test users can sign in and everyone else is blocked at Google. Basic identity scopes are non-sensitive, so publishing takes one click and needs no Google verification review. | pending |
| App domain, home page | `https://uiuc-housing-ai.com` | The live custom domain (`product-launch.md` §2.5). The retired `uiuc-housing-assistant-langchain-ra.vercel.app` subdomain must not be used: it was deleted without a redirect. | pending |
| App domain, authorized domains | `uiuc-housing-ai.com` | Google requires the home page's root domain to be listed here, bare, with no scheme or path. Setting a home page without adding it fails to save. | pending |
| App domain, privacy policy + terms links | left empty | Optional for non-sensitive scopes. There are no `/privacy` or `/terms` routes yet; add them before open registration widens further, then come back and fill these in. | deferred |
| Support / developer contact email | `sz94@illinois.edu` | Google sends app status notices here. Shown on the consent screen. | pending |
| OAuth client | Type **Web application** | The redirect flow runs in a browser against Supabase's callback endpoint. | pending |
| OAuth client, authorized redirect URI | `https://uknyhpwzvdevxfxkpxmy.supabase.co/auth/v1/callback` | Google redirects to Supabase, not to this app. The app's own `/auth/callback` route is where Supabase then sends the browser, and it is configured in Supabase's redirect allowlist, not here. Getting these two confused is the most common way this setup fails. | pending |
| Supabase → Authentication → URL Configuration | Redirect allowlist includes `https://uiuc-housing-ai.com/auth/callback` and `http://localhost:3300/auth/callback` | Without the entry, the post-OAuth return lands on the site root instead of the callback route, so the session exchange never runs. The localhost entry is what makes the flow testable locally. | pending |

#### Symptom-to-cause notes

`{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}` on clicking the Google button means exactly one thing: Google is not enabled on the Supabase providers page. It is a Supabase-side response and says nothing about the Google Cloud setup, so it appears identically whether the OAuth client is missing, half-built, or perfectly configured but not yet pasted into Supabase.

A "this app is blocked" or "has not completed verification" screen after the Google round-trip is the opposite failure: the credentials are wired up correctly and the consent screen is still in Testing.

Implementation notes (already in code): the button calls `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: \`${location.origin}/auth/callback\` } })` and the existing callback route's `exchangeCodeForSession` completes the flow. The login event is logged server-side in the callback route (not from `onAuthStateChange`, which over-counts on every refresh), tagged `metadata.via` with the auth provider (`google` for OAuth, `email` for the magic-link fallback); the email-code flow tags its own login `via: "email_code"`.

### Login card copy (open signup)

- Heading: "Sign in or create your account" / "No password needed."
- Google button: "Continue with Google".
- Divider: "or".
- Email helper: "Works with Gmail, Outlook or any school (.edu) address."
- Email submit: "Email me a code".
- Rejection error, same sentence client-side and server-side: "Use a Gmail, Outlook.com, or school (.edu) email address."

### Verification evidence (2026-07-17)

- `npx tsc --noEmit`: clean.
- `npx eslint` on all changed files (`LoginCard.tsx`, `proxy.ts`, `robots.ts`, `UserMenu.tsx`, `about/page.tsx`, `auth/callback/route.ts`): clean. The two `react-hooks/set-state-in-effect` errors in `app/about/page.tsx` (lines 108/134) predate this work (2026-07-15 landing redesign) and are untouched.
- `npm run build`: passes.
- Running dev server serves the new `/login` (contains "Continue with Google", "Email me a code", "Sign in or create your account"; no "Waiting list" text).

## Next

Go-live is pointing the hook at the allowlist rule, then watch the email sender's quota dashboard for the first days. Enabling Google (§4) removes most of that email load. The longer-term step, school affiliation as a verified badge on open accounts, lives in `audience-and-identity-strategy.md`.
