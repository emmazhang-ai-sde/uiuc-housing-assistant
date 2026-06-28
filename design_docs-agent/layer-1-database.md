# Layer 1: Database — Conversation Persistence

**Created: 2026-06-25**

← Back to [Agent Architecture](agent-architecture.md)

---

## Goal

Store conversation history so users can close the browser and return to previous chats, just like ChatGPT's sidebar.

---

## Technology Choice: Supabase

**Why Supabase:**
- Free tier is sufficient for a portfolio project
- Native Next.js integration via `@supabase/supabase-js`
- Built-in Row Level Security (RLS) for per-user data isolation
- PostgreSQL under the hood — easy to migrate off if needed
- Provides a REST API automatically — no need to write raw SQL queries from the frontend

---

## Schema

Two tables:

**`conversations`** — one row per chat thread. Holds a `user_id` (anonymous session ID), an auto-generated `title`, and timestamps.

**`messages`** — one row per message. References `conversations(id)` with cascade delete. `role` is constrained to `user | assistant | system`. `metadata` (jsonb) is optional — can store cited sources or tool call traces.

Indexes:
- `messages(conversation_id, created_at asc)` — fast history fetch per conversation
- `conversations(user_id, updated_at desc)` — fast sidebar load per user

Full SQL is in [Step 2](step-2-database-api-routes.md#2a--supabase-create-tables).

---

## Row Level Security (RLS)

RLS is enabled on both tables. Each session's data is isolated by `user_id`. For the anonymous (no-auth) case, `user_id` is a UUID stored in `localStorage` — passed to Supabase via `app.user_id` session config.

Full SQL policies are in [Step 2](step-2-database-api-routes.md#2a--supabase-create-tables).

---

## API Routes (Next.js)

Four endpoints under `frontend/app/api/`:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/conversations` | Sidebar: list all conversations for the current session user |
| `POST /api/conversations` | Create a new conversation row |
| `GET /api/conversations/[id]/messages` | Load message history for a conversation |
| `POST /api/conversations/[id]/messages` | Append a user or assistant message |

All routes identify the caller via the `x-session-id` request header. Implementation code is in [Step 2](step-2-database-api-routes.md#2c--nextjs-api-routes).

---

## Session Identity (No Auth)

Anonymous `user_id` is a UUID generated on first visit and stored in `localStorage`. Persists across page refreshes; resets if the user clears storage — acceptable for a portfolio project.

Implementation is in [Step 2](step-2-database-api-routes.md#2b--anonymous-session-identity).

---

## Auto-Title Generation

After the first assistant response, update `conversations.title` using a short LLM prompt:

> "Summarize this question in 5 words or fewer: {first_user_message}"

This avoids every conversation being named "Untitled" in the sidebar. Can be triggered from the backend (Step 3) once the real LLM call is wired.

---

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

The anon key is safe to expose in the browser because RLS enforces data isolation at the database level.
