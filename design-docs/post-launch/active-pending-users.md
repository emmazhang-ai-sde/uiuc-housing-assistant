# Active / Pending Waitlist Users

**Created: 2026-07-09**

## Purpose

How to split the waitlist into "already using the service" versus "signed up but hasn't used it yet," so re-engagement emails can be targeted to the right group instead of blasting everyone the same message.

## Definitions

- **Active**: an email with at least one row in `public.events_with_email`, meaning the person has logged in and triggered a tracked event (`login`, `message_sent`, `map_search`, `card_view`, `listing_view`, etc.). Being on the waitlist or even having an account is not enough on its own, an event has to exist.
- **Pending**: an email present in `public.waitlist` with zero rows in `events_with_email`. This includes people who never created an account at all and people who registered but never actually opened the chat, map, or card view. The two aren't currently split apart; see "Possible follow-up" below if that distinction becomes useful.
- Founder/test emails (the `ADMIN_EMAIL` set, mirrored in `public.test`) are excluded from both lists, the same exclusion the `/admin/activity` dashboard applies so founder testing never inflates real-user counts.

## How to check it

### Option A: run the script (recommended)

```bash
source .venv/bin/activate
python scripts/list_email_segments.py --out scripts/mail-merge-batches
```

Prints both lists to the terminal and writes `scripts/mail-merge-batches/active.txt` and `scripts/mail-merge-batches/pending.txt` (one email per line, ready for a mail-merge tool). That output directory is already gitignored since it holds real student emails.

### Option B: query Supabase directly

Supabase Dashboard → SQL Editor:

```sql
select w.email
from public.waitlist w
where lower(w.email) not in (
  select lower(email) from public.events_with_email
)
order by w.email;
```

Swap `not in` for `in` against the same subquery to get the active list instead. This is handy for a quick look without touching the terminal, but doesn't apply the founder/test exclusion automatically, so double check `sz94@illinois.edu`, `shuyangzhang.cs@gmail.com`, and `shuyangzhang.life@gmail.com` aren't in the result.

## Where the underlying data comes from

- `public.waitlist`: the coming-soon signup table (`frontend/app/coming-soon/page.tsx`), columns `email`, `referral`, `created_at`.
- `public.events` / `public.events_with_email`: usage event log, defined in `scripts/admin-analytics-setup.sql`, populated by `frontend/lib/logEvent.ts` calls from `hooks/useChat.ts`, `components/auth/LoginCard.tsx`, `app/map/page.tsx`, and `app/card/page.tsx`. `events_with_email` is a service-role-only view joining in the email from `auth.users`.
- `public.test` / `ADMIN_EMAIL`: the founder's own test accounts, excluded from both segments.
- Same query pattern powers the `active_users` and `waitlist_count` metrics on `/admin/activity` (`frontend/app/api/admin/activity/route.ts`), so the numbers here should always agree with that dashboard.

## Script reference

`scripts/list_email_segments.py`, added 2026-07-07, modeled on the REST/service-role pattern already used in `scripts/bulk_invite.py` (same `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `frontend/.env.local`, same PostgREST-style `GET` requests). Read-only, sends nothing.

## History

| Date | Waitlist | Active | Pending |
|---|---|---|---|
| 2026-07-07 | 84 | 23 | 61 |
| 2026-07-09 | 88 | 26 | 62 |

## Possible follow-up

"Pending" currently lumps together "never registered" and "registered, never used it." If a different message is ever wanted for those two (e.g. a fresh invite link versus a "come try it out" nudge), that split needs `auth.users` joined against `events_with_email`, similar to what `scripts/bulk_invite.py` already does to find waitlist emails with no account yet.
