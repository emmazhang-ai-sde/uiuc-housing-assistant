# Pre-Launch Readiness Checklist

**Created: 2026-07-05**

Audit of the current repo state against "launch as-is" — specifically triggered by
the question "if I scrape fresh data and push, does it actually show up on every
view?" The answer is no for two of the three views, for a reason that has nothing
to do with today's scrape. Findings below are ordered by severity.

---

## 1. Critical — `snapshots/listings_*.db` has never been committed

`GET /api/listings` (the data source for the Card page and Map page — see
`backend/main.py:80`) and `GET /api/status` (the live stat line on `/about`) both
read `snapshots/listings_<date>.db` via `SNAPSHOTS_DIR` (`config.py:21`).

`.gitignore` has a blanket rule:

```
# SQLite databases (regenerable via scraper + normalizer)
*.db
```

`git log --all -- 'snapshots/*.db'` shows no snapshot `.db` file has ever been
committed, on any date. `chroma_db/chroma.sqlite3` is the one exception — it was
`git add`ed before this rule existed, so git keeps tracking its changes regardless
of the ignore rule. `snapshots/listings_*.db` never got that grandfathering.

**Consequence in production (Railway):**

- `backend/main.py:99-100` — `if not os.path.exists(db_path): return {"listings": []}`.
  No error, no crash — the Card and Map pages just silently render zero results.
- `backend/main.py:70-71` — same guard for `/api/status`; the About page's stat
  line shows `listing_count: null, property_count: null` instead of real numbers.
- `/chat` and `/api/search` are unaffected — they read Chroma, which **is**
  committed — so Chat reflects fresh scrapes correctly. Card and Map do not, and
  as far as `git log` shows, never have since the Map View Tab feature shipped.

**Fix:**

1. Add an explicit exception so the ignore rule doesn't catch the live snapshot:
   ```
   *.db
   !snapshots/listings_*.db
   ```
2. `git add` today's `snapshots/listings_2026-07-05.db` and commit it.
3. Add a step to `phase-5.2-data-refresh-runbook.md`: after `pipeline.ingest`,
   commit both `chroma_db/` **and** the new `snapshots/listings_<date>.db` before
   pushing — otherwise Card/Map silently keep serving zero results (or stale
   results, once one snapshot is committed) after every future scrape.
4. Verify against production directly: `curl https://<railway-url>/api/listings`
   should return real rows, not `{"listings": []}`.

---

## 2. Critical — a file marked "do not commit" is staged for commit

`scripts/waitlist-dashboard.html` contains its own header comment:

> Local file only — do not commit or share (shows real student emails/counts)

Despite that, `git status` currently shows it as a new file staged for commit. It
hardcodes the Supabase anon key and queries the `waitlist` table directly
client-side. The documented RLS policy on `waitlist`
(`product-launch.md` §1.5.3) only grants `INSERT`, so this should not currently
leak data — but if a `SELECT` policy is ever added without updating this file,
anyone with the (public, bundled) anon key and this HTML file could read every
signed-up student's real email. The repo appears to be public (build-in-public
portfolio project), which raises the stakes of anything checked in here.

**Fix:** add `scripts/waitlist-dashboard.html` to `.gitignore`, following the
existing precedent for `scripts/mail-merge-batches/`, and unstage it.

---

## 3. Should decide before opening beta further

- **Per-user daily message quota** (`design-docs/message-quota.md`) — designed,
  not implemented. No cap exists today on how many `/chat` turns one signed-in
  user can send.
- **Concurrency throttling** (`design-docs/product-launch/traffic-monitoring.md`)
  — designed, not implemented. No `asyncio.Semaphore` guard exists on `/chat`
  yet, so a burst of simultaneous beta users could exhaust the shared Groq
  free-tier RPM/TPM window and surface as scattered "assistant ran into an
  error" replies.
- **`LAUNCH_MODE` value in Vercel** — confirm it still matches intent. Per
  `proxy.ts`, authenticated (invited) users always reach the real app regardless
  of this value, so leaving it at `coming_soon` while inviting testers directly
  is a valid deliberate state, not necessarily a bug — just confirm that's still
  the intended state and not an oversight, given invites already went out
  2026-07-03.

---

## 4. Known data-accuracy bug (already documented, not fixed)

`parse_beds()` in `scrapers/universities_group.py` only matches literal
`"N bedroom"` text via regex. Unit types phrased like `"2 BR Suite"` silently
default to `beds=0` and get wrongly excluded from bed-count filters on Card/Map.
Documented in `phase-7-map-view.md` "Follow-up" section. Needs a scraper regex
fix (catch `"BR"` / `"Bed"` abbreviations) plus a re-scrape/backfill, since
`beds` is baked into ingested SQLite/Chroma data rather than computed live.

---

## 5. Repo hygiene (not launch-blocking, but worth resolving before pushing)

- A stray file named `md` at the repo root (actually HTML content, missing a
  real filename/extension) is untracked and may have been saved to the wrong
  path by accident — confirm whether it's needed and rename or remove it.
- An `Agent/` folder at the repo root (`ai201-lab2-plantadvisor-starter`,
  `ai201-week2-instructor-demo`, `learn-agent.md`) looks unrelated to this
  project — confirm it wasn't meant to live outside this repo before it gets
  swept into a commit.
- `frontend/components/FilterPanel.tsx` is orphaned (nothing imports it since
  the Card/Chat pages moved to `FilterBar` / no filter UI). Already flagged in
  project notes; not urgent.

---

## Checklist

- [ ] Commit `snapshots/listings_2026-07-05.db` (after fixing the `.gitignore`
      exception) so Card/Map reflect the current scrape in production
- [ ] Verify prod `GET /api/listings` returns real rows, not `[]`
- [ ] Verify prod `GET /api/status` returns real counts, not `null`
- [ ] Unstage and gitignore `scripts/waitlist-dashboard.html`
- [ ] Confirm `waitlist` table RLS still has no `SELECT` policy for `anon`
- [ ] Decide: implement per-user daily message quota before wider beta rollout,
      or accept the risk short-term
- [ ] Decide: implement `/chat` concurrency throttling before wider beta
      rollout, or accept the risk short-term
- [ ] Confirm current Vercel `LAUNCH_MODE` value matches intent
- [ ] Fix `parse_beds()` in `scrapers/universities_group.py` for `"N BR"` /
      `"N Bed"` phrasing, then re-scrape/backfill
- [ ] Resolve the stray root-level `md` file
- [ ] Resolve the unrelated `Agent/` folder at repo root
- [ ] Add a "commit the new snapshot `.db`" step to
      `phase-5.2-data-refresh-runbook.md`
