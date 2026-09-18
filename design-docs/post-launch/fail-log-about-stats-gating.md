# Fail Log: /about Stats Stuck on "…" for Logged-Out Visitors

**Created: 2026-07-20**

## Symptom

The stats band on the public `/about` page showed its `…` placeholder where "Floor plans tracked" and "Properties across town" should have been. The other two blocks in the same row rendered fine, because "8" comes from `COMPANIES.length` and "100%" is hardcoded. Only the two numbers that come from `fetchStatus()` were missing. The page looked broken to exactly the audience it was built for: a logged-out visitor landing on the marketing page for the first time. Logging in made the numbers appear, which is what eventually gave the root cause away.

## Round 1 (71fa5ff, 2026-07-19): route /api/status through a Next proxy

The hypothesis was that `fetchStatus` was the only client call still hitting the backend directly through `NEXT_PUBLIC_API_URL`, while Card and Map went through their own proxy routes. That variable was unset on Vercel, so the browser fell back to a localhost URL and the request died as mixed content. The fix added `app/api/status/route.ts`, which forwards server-side via `BACKEND_URL` like every other API route, and changed `fetchStatus` to fetch the relative path. A `console.warn` was added inside `fetchStatus` so the failure would stop being silent.

This diagnosis was correct and the fix was worth keeping. It was not the cause of the symptom. The page still showed `…`.

## Round 2 (cfc176f, 2026-07-20): stop gating /api/status

`proxy.ts` (this Next version's renamed `middleware.ts`) keeps an `isPublic` allowlist of paths reachable without a session. `/about` was on that list. The endpoint that feeds `/about` its numbers was not. A logged-out request to `/api/status` therefore fell through to the gate and was answered with a 307 redirect to `/login`. The fix added `path.startsWith("/api/status")` to the allowlist. The endpoint returns three aggregate numbers, carries no user data, and needs no backend token, so nothing is exposed by making it public.

## Why the failure stayed invisible

Three separate mechanisms had to line up to hide a 307 redirect this completely, and each is worth internalizing on its own.

**`fetch` follows redirects by default, so the failure arrived disguised as a success.** The browser followed the 307 to `/login`, got the login page, and handed back a perfectly healthy `200 text/html`. `res.ok` was therefore `true`, the `console.warn` added in round 1 never fired, and control fell straight through to `res.json()`, which threw a parse error on HTML. Round 1's instinct to make the failure loud was right, but the guard was written for the wrong failure mode: it only speaks up when `!res.ok`, and this failure never produced a bad status code at the point the code was looking.

**Every caller swallows the rejection.** All three call sites use `.catch(() => {})` so that a missing count degrades to a placeholder instead of breaking the page. That is the correct product behavior and should stay. The cost is that the parse error had nowhere to surface, so the only evidence a user ever saw was a `…` that looks like a loading state.

**Local dev cannot reproduce this class of bug at all.** `proxy.ts` returns early when `NODE_ENV === "development"` and skips the entire launch-mode gating block. Any bug that lives in that block is structurally invisible on localhost. This is the single most important line in this document: a passing local test says nothing about gating behavior, because locally the gating code does not execute.

## What to do differently

**Measure before fixing, especially when the environments differ.** The move that actually cracked this took one command and no code: `curl` the endpoint on prod, `curl` it locally, compare. Local returned `200` with real data; prod returned `307`. That single comparison eliminated the entire "the endpoint or the data is broken" half of the hypothesis space and pointed straight at the environment-specific layer. It should have been the first action of round 1, before any code was written. Round 1 instead began with a plausible story and a fix, and the story happened to be about a real bug, which is the most misleading outcome available: fixing something genuinely broken feels like progress and quietly buys the assumption that the root cause was found.

**A plausible cause that is also true is not the same as the cause.** Round 1's mixed-content diagnosis was accurate. Both bugs were real and both produced the same visible symptom, so confirming the first one told us nothing about whether it was the only one. The check that distinguishes them is not "does my explanation account for the symptom" but "did I observe the failing request itself." Nobody looked at the actual response until round 2.

**When a page is public, its data dependencies are part of its public surface.** The allowlist named `/about` but not what `/about` fetches. Making a route public is not a single-line decision; it is a decision about a subtree. Worth re-checking the current allowlist whenever a new public page is added.

**Reach for the symptom's own boundary conditions early.** The user's observation that logging in made the numbers appear identified the auth layer instantly, after two rounds of looking elsewhere. "What changes the behavior" is often faster than "what explains the behavior."

## Follow-up hardening (proposed, not implemented)

`fetchStatus` still cannot tell a redirect from a success. Passing `redirect: "manual"` (or asserting the response `content-type` is JSON before parsing) would turn this exact failure into a loud, named error instead of a silent placeholder. Worth doing the next time that file is touched, since this class of bug will recur the moment another public page depends on a gated endpoint.

## Changes

| Where | What | New or Change |
| --- | --- | --- |
| `frontend/app/api/status/route.ts` | Server-side proxy to `BACKEND_URL`, so the browser never needs the backend's port | New (71fa5ff) |
| `frontend/lib/api.ts` | `fetchStatus` fetches the relative path; warns on `!res.ok` | Change (71fa5ff) |
| `frontend/proxy.ts` | `/api/status` added to the `isPublic` allowlist | Change (cfc176f) |

## Appendix: verification

Confirm the endpoint is reachable without a session. `200` is correct; `307` means the gate is back.

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://uiuc-housing-ai.com/api/status
```

Confirm the payload, then open `https://uiuc-housing-ai.com/about` in a private window and check that the first two stat blocks show numbers rather than `…`.

```bash
curl -s https://uiuc-housing-ai.com/api/status
# {"last_scraped":"2026-07-09","listing_count":1164,"property_count":595}
```

Note that neither check is meaningful against `localhost:3300`, for the reason given above: dev skips the gating block entirely. This must be verified against a deployed environment, and on Vercel that means after a manual Redeploy.
