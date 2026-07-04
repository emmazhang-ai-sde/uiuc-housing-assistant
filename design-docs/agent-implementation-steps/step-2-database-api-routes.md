# Step 2: Database + API Routes + Wire Real Data

**Created: 2026-06-28**

← Back to [Agent Architecture](agent-architecture.md)

**Status: ✅ Complete**

---

## Goal

Replace hardcoded seed data with real Supabase persistence. After this step, conversation history survives page refresh and the sidebar shows the user's actual past chats.

Schema design and technology rationale are in [Layer 1: Database](layer-1-database.md).

> Persistence looked done here but silently saved nothing for two days across four stacked bugs (dev bypass ordering, swallowed errors, missing table grants, a stale-token race). The full postmortem is in [Chat Persistence: Four-Round Debugging Log](chat-persistence-debugging.md).

---

## Auth Requirements

- **Login required** — no anonymous session. All API routes return 401 if the user is not authenticated.
- **Session persists until explicit sign-out** — no auto-logout. The user stays logged in across page refreshes and browser restarts as long as the refresh token is valid.
- `@supabase/ssr` handles access token refresh automatically, but only if the request-intercepting file calls `supabase.auth.getUser()` on every request. Without this, the 1-hour access token expires even for active users.

> **Note:** This Next.js version renamed `middleware.ts` to `frontend/proxy.ts` (breaking change — see `frontend/AGENTS.md`). The snippet below is illustrative; the actual, current implementation lives in [`frontend/proxy.ts`](../../frontend/proxy.ts), annotated `// [Step 2]` at the session-refresh block.

Add session refresh to `frontend/proxy.ts` (alongside the existing LAUNCH_MODE logic):

```typescript
import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request })

  // Refresh the Supabase session on every request so the access token
  // never expires while the user is active.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        ),
      },
    }
  )
  await supabase.auth.getUser()  // triggers silent token refresh if needed

  // ... existing LAUNCH_MODE redirect logic below ...

  return response
}
```

Supabase Auth settings to verify (Dashboard → Auth → Configuration):
- **JWT Expiry**: 3600s (default, fine — middleware refreshes it)
- **Refresh Token Expiry**: set to a long value (e.g. 43200 = 30 days) so the user stays logged in across sessions

---

## 2.1 — Supabase: Create Tables

Run in the Supabase SQL editor:

```sql
create table conversations (
  id          uuid default gen_random_uuid() primary key,
  user_id     text not null,
  title       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table messages (
  id                uuid default gen_random_uuid() primary key,
  conversation_id   uuid references conversations(id) on delete cascade,
  role              text not null check (role in ('user', 'assistant', 'system')),
  content           text not null,
  metadata          jsonb,
  created_at        timestamptz default now()
);

create index messages_conversation_id_idx on messages(conversation_id, created_at asc);
create index conversations_user_id_idx on conversations(user_id, updated_at desc);

-- user_id is text; auth.uid() is cast to text for the RLS check.
-- Supabase Auth user IDs are UUIDs serialized as strings, so this is safe.
alter table conversations enable row level security;
alter table messages enable row level security;

create policy "user owns conversation"
  on conversations for all
  using (user_id = auth.uid()::text);

create policy "user owns messages via conversation"
  on messages for all
  using (
    conversation_id in (
      select id from conversations where user_id = auth.uid()::text
    )
  );

-- Auto-update conversations.updated_at whenever a message is inserted,
-- so the sidebar (ordered by updated_at desc) always reflects the latest activity.
-- SECURITY DEFINER: this bookkeeping UPDATE runs as the function owner, so it does
-- not depend on the invoking `authenticated` role holding UPDATE on conversations.
-- Without it, a missing UPDATE grant makes the trigger fail *after* the message
-- insert passes RLS, rolling back the whole insert with a confusing
-- "42501 permission denied for table conversations" on a messages POST.
-- search_path is pinned to defend against search_path hijacking under DEFINER.
create or replace function touch_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation
  after insert on messages
  for each row execute function touch_conversation();

-- RLS filters *which rows* a role can see; it does not grant the role
-- permission to query the table at all. Tables created via the Dashboard's
-- "New table" button get this automatically; tables created via raw SQL
-- (as above) do not — without it, every request fails with
-- 42501 "permission denied for table conversations/messages", even though
-- the RLS policies themselves are correct.
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
```

### Verifying This Step Actually Ran

Creating the tables doesn't guarantee the RLS policies and trigger were applied too — the SQL editor can partially fail or be re-run out of order. Use these read-only checks in the Supabase SQL Editor to confirm the full block above (tables + RLS + trigger) is live, without touching any data.

**Run each query separately, in its own tab.** The Supabase SQL Editor only displays the result of the last statement when multiple statements are run together in one tab — pasting both queries into the same tab and running them will only show the trigger result and hide the policy result.

**Tab 1 — RLS policies:**

```sql
select tablename, policyname from pg_policies where tablename in ('conversations', 'messages');
```

Expected result:

| tablename | policyname |
|---|---|
| `conversations` | `user owns conversation` |
| `messages` | `user owns messages via conversation` |

**Tab 2 — trigger:**

```sql
select tgname from pg_trigger where tgname = 'messages_touch_conversation';
```

Expected result:

| tgname |
|---|
| `messages_touch_conversation` |

**Tab 3 — table grants (the check that actually would have caught the bug below):**

```sql
select table_name, privilege_type from information_schema.role_table_grants
where grantee = 'authenticated' and table_name in ('conversations', 'messages')
order by table_name, privilege_type;
```

Expected result: 4 rows per table — `SELECT`, `INSERT`, `UPDATE`, `DELETE` for both `conversations` and `messages`. RLS policies existing is not enough on its own; without these grants every query fails with `42501 permission denied for table conversations/messages` regardless of what the RLS policies say.

If all three queries return the expected rows, Step 2.1 (tables + RLS + trigger + grants) is fully applied and needs no further action.

**Confirmed 2026-07-03:** Tab 1 and Tab 2 checks ran against the live Supabase project and returned the expected rows. Tab 3 was added later the same day after discovering the grants were missing — the 2.1 SQL block never included `GRANT` statements (only the Dashboard's "New table" button adds those automatically; raw `CREATE TABLE` does not). Symptom: chat worked end-to-end (UI showed messages, `/api/chat` succeeded) but nothing ever appeared in `conversations`/`messages` — the persist calls in `useChat.ts` are fire-and-forget and the API routes didn't check `error` from Supabase, so the `42501` failures were completely silent until error surfacing was added to the routes.

---

## 2.2 — Next.js API Routes

Four Next.js API routes act as the bridge between the frontend and Supabase.
The frontend never talks to Supabase directly — all database access goes through these server-side routes.

```
Browser stores HTTP-only cookie                    [Browser]
        │
        ▼
React calls /api/... (e.g. /api/profile)           [Frontend — page/component]
        │
        ▼
Cookie is sent automatically with the request       [Browser]
        │
        ▼
API route calls supabase.auth.getUser()             [Backend — Next.js API Route]
        │
        ▼
Resolves the current user.id                        [Backend]
        │
        ▼
Query sent to Supabase                               [Backend → Service]
        │
        ▼
RLS re-checks: user_id == current user               [Database — Supabase/Postgres]
        │
        ▼
Only rows belonging to the current user are returned [Database — Supabase/Postgres]
```

**Auth:** Every route calls `supabase.auth.getUser()` to identify the caller from their session cookie. If the user is not logged in, the route returns 401 immediately.

**Row Level Security (RLS):** RLS is a PostgreSQL feature that enforces per-row access control at the database level. Our policy (`user_id = auth.uid()::text`) means Postgres automatically filters every query to only return rows belonging to the current user — even if the application code forgot to add a `WHERE` clause. This is a second line of defense on top of the 401 check.

**No custom headers:** No `x-session-id` or similar headers are needed. The user's identity travels as an HTTP-only session cookie managed by `@supabase/ssr` — transparent to the application code.

| Route file | Methods | Purpose |
|---|---|---|
| [`frontend/app/api/conversations/route.ts`](../frontend/app/api/conversations/route.ts) | `GET`, `POST` | List all conversations for the sidebar / create a new one |
| [`frontend/app/api/conversations/[id]/messages/route.ts`](../frontend/app/api/conversations/%5Bid%5D/messages/route.ts) | `GET`, `POST` | Fetch message history for a conversation / append a message |

Both files carry a `// [Step 2]` header comment pointing back to this section.

**Confirmed 2026-07-03:** both route files were checked against the live column names used in the [2.1](#21--supabase-create-tables) schema — `conversations(id, title, updated_at, user_id)` and `messages(id, conversation_id, role, content, metadata, created_at)` — and match exactly.

**Bug found and fixed 2026-07-03:** both route files used to short-circuit on `NODE_ENV === "development"` *before* checking auth, so persistence was silently skipped for every request in local dev — even a genuinely logged-in user (verified with a real `sz94@illinois.edu` session: chat worked, but no row ever appeared in `conversations`/`messages`). Fixed by calling `supabase.auth.getUser()` first and only falling back to the mock response when there is *no* session, so a real login always persists for real, in dev or prod. The mock fallback is kept so the UI stays usable without logging in every time (Supabase free tier caps magic-link emails at 2/hour).

---

## 2.3 — Update `useChat.ts`

Modifies the existing [`frontend/hooks/useChat.ts`](../frontend/hooks/useChat.ts).

**Replace hardcoded seed data with real API calls:** Step 1's `useChat.ts` had fake conversation and message data written directly in code (`SEED_CONVERSATIONS` / `SEED_MESSAGES`), and a hardcoded 1.2-second delay before returning a fixed reply string. Step 2 replaces all of this with real HTTP requests — reading from and writing to the database.

**No session header needed — auth is handled by cookies transparently:** After login, Supabase stores the session in a browser cookie. Every subsequent `fetch()` call automatically includes that cookie — no manual work needed in the frontend code. The API routes read the cookie to identify the caller. This is in contrast to an alternative approach where you would manually attach a custom header (e.g. `x-session-id: xxx`) to every request.

| | Step 1 (before) | Step 2 (now) |
|---|---|---|
| `conversations` initial value | hardcoded `SEED_CONVERSATIONS` | `[]`, loaded from `/api/conversations` on mount |
| `activeId` initial value | `"conv-1"` | `null`, auto-selects most recent after load |
| `messagesByConv` initial value | `{ "conv-1": SEED_MESSAGES }` | `{}`, fetched on demand per conversation |
| `selectConversation` | sync, only `setActiveId` | async, fetches history on first select (cached after) |
| `newConversation` | generates UUID locally | `POST /api/conversations`, uses DB-returned id |
| `sendMessage` | mock delay only | optimistic UI → persist user msg → mock reply → persist assistant msg |
| seed data | `SEED_CONVERSATIONS` / `SEED_MESSAGES` constants | removed |

`useChat.ts` carries a `// [Step 2]` header comment pointing back to this section.

**Confirmed 2026-07-03:** all rows above match the current code except `sendMessage` — the mock reply has since been replaced by a real `/api/chat` call (Step 3/4), so the row now reads optimistic UI → persist user msg → real backend call → persist assistant msg. Everything else (initial values, `selectConversation`, `newConversation`, seed data removal) matches exactly.

---

← [Step 1: Static Chat UI](step-1-static-chat-ui.md) · [Step 3: Conversation Memory & Tool Calling](../agent/groq-tool-calling.md) →
