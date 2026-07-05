# Pre-Launch Readiness Checklist

**Created: 2026-07-05**

Audit of the current repo state against "launch as-is" — specifically triggered by the question "if I scrape fresh data and push, does it actually show up on every view?" The answer is no for two of the three views, for a reason that has nothing to do with today's scrape. Findings below are ordered by severity.

---

## 1. Critical — `snapshots/listings_*.db` has never been committed

`GET /api/listings` (the data source for the Card page and Map page — see `backend/main.py:80`) and `GET /api/status` (the live stat line on `/about`) both read `snapshots/listings_<date>.db` via `SNAPSHOTS_DIR` (`config.py:21`).

`.gitignore` has a blanket rule:

```
# SQLite databases (regenerable via scraper + normalizer)
*.db
```

`git log --all -- 'snapshots/*.db'` shows no snapshot `.db` file has ever been committed, on any date. `chroma_db/chroma.sqlite3` is the one exception — it was `git add`ed before this rule existed, so git keeps tracking its changes regardless of the ignore rule. `snapshots/listings_*.db` never got that grandfathering.

**Consequence in production (Railway):**

- `backend/main.py:99-100` — `if not os.path.exists(db_path): return {"listings": []}`. No error, no crash — the Card and Map pages just silently render zero results.
- `backend/main.py:70-71` — same guard for `/api/status`; the About page's stat line shows `listing_count: null, property_count: null` instead of real numbers.
- `/chat` and `/api/search` are unaffected — they read Chroma, which **is** committed — so Chat reflects fresh scrapes correctly. Card and Map do not, and as far as `git log` shows, never have since the Map View Tab feature shipped.

**Fix:**

1. Add an explicit exception so the ignore rule doesn't catch the live snapshot: `*.db` then `!snapshots/listings_*.db` on the next line.
2. `git add` today's `snapshots/listings_2026-07-05.db` and commit it.
3. Add a step to `phase-5.2-data-refresh-runbook.md`: after `pipeline.ingest`, commit both `chroma_db/` **and** the new `snapshots/listings_<date>.db` before pushing — otherwise Card/Map silently keep serving zero results (or stale results, once one snapshot is committed) after every future scrape.
4. Verify against production directly: `curl https://<railway-url>/api/listings` should return real rows, not `{"listings": []}`.

---

## 2. ~~Critical~~ Reviewed and accepted — a file marked "do not commit" is staged for commit

`scripts/waitlist-dashboard.html` contains its own header comment: "Local file only — do not commit or share (shows real student emails/counts)".

Despite that, `git status` currently shows it as a new file staged for commit. It hardcodes the Supabase anon key and queries the `waitlist` table directly client-side. The documented RLS policy on `waitlist` (`product-launch.md` §1.5.3) only grants `INSERT`, so this should not currently leak data — but if a `SELECT` policy is ever added without updating this file, anyone with the (public, bundled) anon key and this HTML file could read every signed-up student's real email. The repo appears to be public (build-in-public portfolio project), which raises the stakes of anything checked in here.

**Decision (2026-07-05):** accepted as-is, commit it. The `waitlist` table's RLS only grants `INSERT` to `anon` (no `SELECT`), so the bundled anon key in this file cannot actually read the table today — the "do not commit" comment was precautionary, not a description of a live leak.

---

## 3. Should decide before opening beta further

- **Per-user daily message quota** (`design-docs/message-quota.md`) — re-confirmed by grepping `backend/`, `rag/`, and the Next.js API routes for `Semaphore`, `DAILY_MESSAGE_LIMIT`, or any rate-limit logic: none exists. No cap on how many `/chat` turns one signed-in user can send today.
- **Concurrency throttling** (`design-docs/product-launch/traffic-monitoring.md`) — same grep, same result: no `asyncio.Semaphore` guard on `/chat`. Risk scales with how many invite batches have gone out, not with all 60 waitlist signups at once — invites are sent in batches of 15 (`waitlist-launch-mail-merge.md`), so this is a growing risk as more batches are released, not an immediate one on day one.
- **`LAUNCH_MODE` value in Vercel** — re-analyzed and downgraded: this is not actually an open question. `invite-user-email-test.md` confirms the invite flow is Supabase's own "Invite user" → magic link → session created directly, which bypasses `/login` and the `LAUNCH_MODE` gate entirely per `proxy.ts` (authenticated users always reach the real app regardless of this value). Leaving `LAUNCH_MODE=coming_soon` while inviting batches is the documented, intentional design — no action needed.

---

## 4. Known data-accuracy bug (already documented, not fixed) — quantified against today's data

`parse_beds()` in `scrapers/universities_group.py` only matches literal `"N bedroom"` text via regex (`re.search(r"(\d+)\s+bedroom", ...)`), so unit types phrased like `"1 BR"` or `"6 Bed Townhouse"` fall through to `beds=0`. Queried `snapshots/listings_2026-07-05.db` directly: 18 of 883 listings (~2%) have `beds=0` from unit-type text the regex misses, including `"1 BR"`, `"2 BR Flat"`, `"Renovated 2 BR"`, and `"6 Bed Townhouse"`. Checked the frontend consequence in `frontend/lib/availability.ts`'s `bedsLabel()`: for `beds=0` on a non-studio unit type it returns an empty string, not a wrong "Studio" label — so the actual damage is a blank bed-count pill plus wrongful exclusion from bed-count filters, not mislabeling. Worst case today is `"6 Bed Townhouse"`, which shows no bed count at all and won't surface if a user filters for 6 beds. Documented in `phase-7-map-view.md` "Follow-up" section. Needs a scraper regex fix (catch `"BR"` / `"Bed"` abbreviations) plus a re-scrape/backfill, since `beds` is baked into ingested SQLite/Chroma data rather than computed live.

---

## 5. Repo hygiene (not launch-blocking, but worth resolving before pushing)

- ~~A stray file named `md` at the repo root (actually HTML content, missing a real filename/extension)~~ — resolved 2026-07-05, identified as the waitlist "almost ready" notification email template and moved to `design-docs/product-launch/waitlist-notify-email-template.html`.
- ~~An `Agent/` folder at the repo root (`ai201-lab2-plantadvisor-starter`, `ai201-week2-instructor-demo`, `learn-agent.md`) looks unrelated to this project~~ — resolved 2026-07-05, moved out of the repo manually.
- `frontend/components/FilterPanel.tsx` is orphaned (nothing imports it since the Card/Chat pages moved to `FilterBar` / no filter UI). Already flagged in project notes; not urgent.

---

## Checklist

- [x] Commit `snapshots/listings_2026-07-05.db` (after fixing the `.gitignore` exception) so Card/Map reflect the current scrape in production — done and pushed (`0643463`); historical snapshots also backed up (`981a678`)
- [ ] Verify prod `GET /api/listings` returns real rows, not `[]`
- [ ] Verify prod `GET /api/status` returns real counts, not `null`
- [x] `scripts/waitlist-dashboard.html` — reviewed, OK to commit as-is (no `SELECT` RLS policy exists, so the bundled anon key can't read the table)
- [ ] Confirm `waitlist` table RLS still has no `SELECT` policy for `anon` (re-check any time RLS policies change)
- [ ] Decide: implement per-user daily message quota before wider beta rollout, or accept the risk short-term (risk grows with each 15-person invite batch released)
- [ ] Decide: implement `/chat` concurrency throttling before wider beta rollout, or accept the risk short-term (same as above)
- [x] `LAUNCH_MODE` — no action needed; invited users bypass the gate entirely via Supabase's own invite-link auth, independent of this value
- [x] Fix `parse_beds()` in `scrapers/universities_group.py` for `"N BR"` / `"N Bed"` phrasing, then re-scrape/backfill (affects 18/883 listings today, worst case `"6 Bed Townhouse"` showing no bed count) — fixed 2026-07-05: regex updated to `r"(\d+)\s*(?:bedroom|bed\b|br\b)"`, verified against all 137 distinct `unit_type` strings (7 variants changed, zero unexpected remaining `beds=0`), then backfilled `data/universities_group_raw.json` in place (no re-scrape needed) and re-ran `pipeline.normalize` + `pipeline.geocode` + `pipeline.ingest` — 7 listings re-embedded in Chroma, confirmed correct in `snapshots/listings_2026-07-05.db`
- [x] Resolve the stray root-level `md` file — moved to `design-docs/product-launch/waitlist-notify-email-template.html`
- [x] Resolve the unrelated `Agent/` folder at repo root — moved out manually
- [x] Add a "commit the new snapshot `.db`" step to `phase-5.2-data-refresh-runbook.md` — done
