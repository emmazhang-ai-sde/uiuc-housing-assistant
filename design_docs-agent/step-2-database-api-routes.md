# Step 2: Database + API Routes + Wire Real Data

**Created: 2026-06-28**

← Back to [Agent Architecture](agent-architecture.md)

**Status: ✅ Complete**

---

## Goal

Replace hardcoded seed data with real Supabase persistence. After this step, conversation history survives page refresh and the sidebar shows the user's actual past chats.

Schema design and technology rationale are in [Layer 1: Database](layer-1-database.md).

---

## Auth Requirements

- **Login required** — no anonymous session. All API routes return 401 if the user is not authenticated.
- **Session persists until explicit sign-out** — no auto-logout. The user stays logged in across page refreshes and browser restarts as long as the refresh token is valid.
- `@supabase/ssr` handles access token refresh automatically, but only if `middleware.ts` calls `supabase.auth.getUser()` on every request. Without this, the 1-hour access token expires even for active users.

Add session refresh to `frontend/middleware.ts` (alongside the existing LAUNCH_MODE logic):

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

## 2a — Supabase: Create Tables

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
create or replace function touch_conversation()
returns trigger language plpgsql as $$
begin
  update conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation
  after insert on messages
  for each row execute function touch_conversation();
```

---

## 2b — Next.js API Routes

Four Next.js API routes act as the bridge between the frontend and Supabase.
The frontend never talks to Supabase directly — all database access goes through these server-side routes.

**Auth:** Every route calls `supabase.auth.getUser()` to identify the caller from their session cookie. If the user is not logged in, the route returns 401 immediately.

**Row Level Security (RLS):** RLS is a PostgreSQL feature that enforces per-row access control at the database level. Our policy (`user_id = auth.uid()::text`) means Postgres automatically filters every query to only return rows belonging to the current user — even if the application code forgot to add a `WHERE` clause. This is a second line of defense on top of the 401 check.

**No custom headers:** No `x-session-id` or similar headers are needed. The user's identity travels as an HTTP-only session cookie managed by `@supabase/ssr` — transparent to the application code.

| Route file | Methods | Purpose |
|---|---|---|
| [`frontend/app/api/conversations/route.ts`](../frontend/app/api/conversations/route.ts) | `GET`, `POST` | List all conversations for the sidebar / create a new one |
| [`frontend/app/api/conversations/[id]/messages/route.ts`](../frontend/app/api/conversations/%5Bid%5D/messages/route.ts) | `GET`, `POST` | Fetch message history for a conversation / append a message |

---

## 2c — Update `useChat.ts`

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

---

## Deferred to Later Steps

| Item | Deferred to |
|------|------------|
| Real FastAPI backend call | Step 3/4 |
| Auto-title via LLM (2d) | Step 3 — needs real backend wired first |
| Streaming | Step 6 |
