# Per-User Daily Message Quota

**Created: 2026-07-02**

Caps how many chat turns a signed-in user can send per day, to bound Groq API
traffic/cost. Enforced at message-send time, not conversation-create time —
capping the number of *conversations* a user can open doesn't bound LLM calls,
since a user can send unlimited messages inside one conversation.

---

## 1. Scope

1.1 Limit is on **user-authored messages per rolling day**, since each one maps
1:1 to a `agent.ainvoke()` call in `backend/main.py`'s `/chat` endpoint — that's
the actual cost driver, not conversations or assistant replies.

1.2 Out of scope for v1: per-minute burst limiting (Groq's own 30k TPM cap
already backstops bursts, just with an ugly error instead of a friendly one —
see §7), and a cap on conversation *count* (doesn't address cost; see above).

## 2. Enforcement point

`frontend/app/api/conversations/[id]/messages/route.ts`'s `POST` handler, only
when `role === "user"`. Reasons:

- It already resolves `user.id` via `supabase.auth.getUser()` — no new auth
  plumbing.
- It's the first place a new turn is durably recorded, and in `useChat.ts`
  (`sendMessage`, lines 99–104) it runs *before* the proxy call to
  `/api/chat` → FastAPI `/chat` → Groq. Rejecting here means a quota-exceeded
  turn never reaches the backend or Groq at all.
- The Python backend (`backend/main.py`) stays untouched — `verify_token()`
  only validates the JWT today and doesn't extract `sub`, so enforcing there
  would mean adding user-id extraction *and* a Supabase client to a backend
  that currently has neither.

## 3. Schema change

Add a `user_id uuid references auth.users(id)` column to the existing
`messages` table, populated on every insert (the route already has `user.id`
in scope). This denormalizes the owner onto `messages` so the quota check is a
single indexed query instead of a join through `conversations`:

```sql
alter table messages add column user_id uuid references auth.users(id);
create index messages_user_id_created_at_idx on messages (user_id, created_at);
```

Backfill for existing rows isn't needed — old messages predate the quota and
just won't count toward anyone's limit.

## 4. Quota check

```ts
// inside POST, before the insert, only when role === "user"
const limit = Number(process.env.DAILY_MESSAGE_LIMIT ?? 20)
const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0)

const { count } = await supabase
  .from("messages")
  .select("id", { count: "exact", head: true })
  .eq("user_id", user.id)
  .eq("role", "user")
  .gte("created_at", todayStart.toISOString())

if ((count ?? 0) >= limit) {
  return NextResponse.json(
    { error: "quota_exceeded", limit, message: `You've hit today's ${limit}-message limit — try again after midnight UTC.` },
    { status: 429 }
  )
}
```

Resets at UTC midnight (simple, no timezone table needed). Not wrapped in a
transaction/RPC — a count-then-insert race is possible under concurrent
double-submits, but at this project's traffic level that's an acceptable risk,
not worth a Postgres function for.

`DAILY_MESSAGE_LIMIT` is an env var (Vercel → Production, per existing
convention — see naming feedback on `LAUNCH_MODE`) so the cap can be tuned
without a redeploy of application logic. Default 20 if unset.

## 5. Frontend handling

`useChat.ts`'s `sendMessage` (line 100) already `await`s the persist call
before invoking `/api/chat`. On a 429 there, it must stop before calling
`/api/chat` and surface the message as an assistant-style bubble instead of a
generic "something went wrong":

```ts
const persistRes = await fetch(`/api/conversations/${convId}/messages`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ role: "user", content }),
})
if (persistRes.status === 429) {
  const { message } = await persistRes.json()
  setMessagesByConv(prev => ({ ...prev, [convId!]: [...(prev[convId!] ?? []), userMsg, {
    id: crypto.randomUUID(), role: "assistant", content: message, created_at: new Date().toISOString(),
  }] }))
  setLoadingByConv(prev => ({ ...prev, [convId!]: false }))
  return
}
```

Styled with the existing Morandi palette assistant bubble — no new component
needed, just a plain-text warning message.

## 6. Dev mode

Match the existing bypass pattern in this route
(`if (process.env.NODE_ENV === "development") ...`) — skip the quota check
entirely in dev, same as the auth check right above it.

## 7. Relationship to Groq's own TPM limit

`MAX_CHECKPOINTED_MESSAGES` (`rag/agent.py:30`) already trims context to stay
under Groq's 30k TPM cap — that's a per-request context-size guard, unrelated
to this per-user daily count. The two are complementary: this quota stops one
user from generating excessive traffic; the TPM trim keeps any single request
cheap. No change needed there.

## 8. Verification

1. Apply the SQL migration in the Supabase SQL editor (`messages` table).
2. Set `DAILY_MESSAGE_LIMIT=2` locally (or in `.env.local`) for a fast manual
   test.
3. Sign in, send 2 messages in a conversation — both succeed.
4. Send a 3rd — expect a 429 from `/api/conversations/[id]/messages`, and the
   friendly limit message rendered in the chat UI, with no call reaching the
   FastAPI backend (confirm via backend logs staying silent).
5. Reset `DAILY_MESSAGE_LIMIT` to a real value (e.g. 20) before merging.
