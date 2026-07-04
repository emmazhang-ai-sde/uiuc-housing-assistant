# Chat Persistence: Five-Round Debugging Log

**Created: 2026-07-04**

← Back to [Agent Architecture](../agent/agent-architecture.md)

This is the third doc in the chat-persistence series, after [Layer 1: Database](../agent/layer-1-database.md) (design) and [Step 2: Database + API Routes](step-2-database-api-routes.md) (implementation). It records how a "chat works but nothing saves" bug (and then a follow-on "saves but does not reload" bug) was tracked down over five rounds on 2026-07-03 and 2026-07-04, so the same class of mistake is easy to recognize next time.

---

## The symptom

The chat worked end to end in the UI: messages appeared, the assistant replied, filters ran. But the Supabase `conversations` and `messages` tables stayed empty. Nothing was ever written, and nothing surfaced an error. The `/api/chat` path (the actual answer) has no persistence in it, which is why the conversation looked healthy while the database quietly stayed empty.

Rounds 1 through 4 were about writes never landing. Round 5, found only after writes worked, was the mirror image: the rows were in the database but never loaded back on refresh. Each defect, once fixed, exposed the next.

---

## Round 1: the dev bypass ran before the auth check

**What we saw.** Logged in as a real user, still no rows.

**Diagnosis.** Both route files started with a dev short-circuit as their very first statement:

```typescript
// frontend/app/api/conversations/route.ts and .../[id]/messages/route.ts
if (process.env.NODE_ENV === "development") return NextResponse.json(/* mock */)
```

`next dev` always sets `NODE_ENV=development`, so every persistence request returned a mock and never touched the database, even for a genuinely logged-in user. The bypass had been added so a developer could use the UI without logging in (the Supabase free tier caps magic-link emails at 2 per hour), but it was placed ahead of the auth check, so it fired unconditionally in local dev.

**Fix.** Reorder: call `supabase.auth.getUser()` first, and only fall back to the mock when there is no session.

**Result.** Still failed. The reason was now hidden behind silent errors, which was Round 2.

---

## Round 2: silent Supabase errors hid the real failure

**Diagnosis.** The routes destructured only `{ data }` from every Supabase call and ignored `{ error }`. A failed write returned HTTP 200 with `data: null`, and the frontend persist calls in `useChat.ts` were fire and forget (`await fetch(...)` with no `.ok` check). So a failing insert produced no error anywhere: not in the network tab, not in the terminal, not in the UI.

**Fix.**
- API routes: destructure `{ data, error }`, and on `error` log it and return HTTP 500.
- Frontend: check `res.ok` on each persist call and `console.error` the body on failure.

**Result.** The real error finally appeared in the terminal:

```
42501 permission denied for table conversations
hint: 'Grant the required privileges to the current role with: GRANT SELECT ON public.conversations TO authenticated;'
```

---

## Round 3: missing table grants (RLS is not a grant)

**Root cause.** The `authenticated` role had no base privileges on the tables. This is the key distinction: Row Level Security controls *which rows* a role may see, but it does not grant the role permission to query the table at all. Those are two independent gates and both must pass. Tables created through the Supabase Dashboard "New table" button get grants automatically. The raw `CREATE TABLE` SQL in Step 2.1 never included any `GRANT`, so the gate was missing from day one.

**A subtlety worth remembering.** The error appeared on a `messages` insert but named the `conversations` table. Inserting one message touches `conversations` in two hidden places:

1. the `messages` RLS policy runs a subquery `select id from conversations where user_id = auth.uid()::text`, which needs SELECT on `conversations`, and
2. the `messages_touch_conversation` trigger runs `update conversations set updated_at = now()`, which needs UPDATE on `conversations`.

The Postgres hint only suggested `GRANT SELECT`. Following the hint alone would clear the RLS subquery but leave the trigger's UPDATE failing with the same code on the next attempt.

**Fix.**
- Grant the full set the routes actually use:
  ```sql
  grant select, insert, update, delete on public.conversations to authenticated;
  grant select, insert, update, delete on public.messages to authenticated;
  ```
- Harden the trigger so its bookkeeping UPDATE never depends on the caller's grant at all:
  ```sql
  create or replace function touch_conversation()
  returns trigger language plpgsql security definer set search_path = public as $$
  begin
    update public.conversations set updated_at = now() where id = new.conversation_id;
    return new;
  end;
  $$;
  ```
- Added a verification query to Step 2.1 that lists the grants, so this gate is checkable, not assumed.

**Result.** The permission error was gone. A new, different error took its place, which meant progress:

```
42501 new row violates row-level security policy for table "messages"
```

---

## Round 4: the stale-token race and the ghost conversation

**What we saw.** In the terminal, back to back:

```
POST /api/conversations 200 in 8ms (application-code: 2ms)
POST /api/conversations/479a1efc.../messages failed:
  new row violates row-level security policy for table "messages"
```

**Diagnosis.** The tell is the timing. `application-code: 2ms` is far too fast for a real insert against Supabase cloud (those take tens to over a hundred milliseconds over the network). So the conversation POST did not hit the database. It fell into the dev mock, which returns a fresh random UUID (`479a1efc...`) without writing a row. Every message insert to that id then failed the `messages` RLS check, because the check requires the `conversation_id` to belong to a real conversation owned by the user, and this conversation never existed.

**Root cause.** `proxy.ts` skipped the Supabase session refresh entirely in development:

```typescript
if (process.env.NODE_ENV === "development") {
  return NextResponse.next({ request })   // no getUser(), so no token refresh
}
```

The 1-hour access token went stale (the debugging spanned two days). With no central refresh in middleware, each API route tried to refresh the token ad hoc, and concurrent requests raced on Supabase's *rotating* refresh token: the first request to refresh rotated the token and won a valid user, and a near-simultaneous request presenting the now-superseded token got `null`. A `null` user fell into the dev mock, produced the ghost conversation id, and everything downstream broke. This is exactly why it looked intermittent and "sometimes worked."

The email-quota reasoning that motivated skipping refresh was a conflation: token refresh does not send email. Only magic-link sign-in touches the 2-per-hour quota.

**Fix.**
- `proxy.ts`: run `getUser()` (the session refresh) on every request including dev, forwarding the rotated cookies to both the request and the response. Skip only the launch-mode gating in dev, so `/chat` stays reachable without the pre-launch flow.
- Removed the dev-mock branches from all routes. A missing session now returns a real 401 instead of a fake id. Failing loud is strictly better than silently minting an id that corrupts later inserts.

**Result.** Working, for writes. A new chat creates a real `conversations` row, and both messages persist with `metadata` populated. The database was now correct, which is what set up Round 5.

---

## Round 5: saved, but not reloaded on refresh

**What we saw.** After writes worked, a refresh showed the conversation in the sidebar ("New conversation") but an empty chat area (the "Let's talk it through" empty state), while the `messages` table clearly held the rows.

**Diagnosis.** The on-mount effect in `useChat.ts` loaded the conversation list and auto-selected the most recent one, but only by setting `activeId`:

```typescript
.then((data: Conversation[]) => {
  setConversations(data)
  if (data.length > 0) setActiveId(data[0].id)   // sets active, never fetches messages
})
```

Message loading lived only in `selectConversation`, which fires when the user clicks a conversation in the sidebar. On a fresh mount nobody clicks, so `messagesByConv[activeId]` stayed empty and the derived `messages = messagesByConv[activeId] ?? []` rendered the empty state. Setting the active conversation and loading its messages were two separate actions, and mount only did the first.

This is the mirror image of Rounds 1 through 4: those were writes that never landed, this was a read that never fired.

**Fix.** Extracted the fetch-and-rehydrate logic into a shared `fetchMessages(id)` helper and called it from both places:
- the on-mount effect now `await`s `fetchMessages(first)` for the auto-selected conversation and populates `messagesByConv`, and
- `selectConversation` uses the same helper.

(One self-inflicted snag along the way: the first attempt put `await fetchMessages(...)` *inside* the non-async `setMessagesByConv(prev => ...)` updater, which does not compile. Await first, then set state.)

**Result.** A refresh now reopens the most recent conversation with its full history and rehydrated card grid. Clicking any other conversation loads it on demand, cached after the first load.

---

## Parallel improvement: actually saving "all the info"

The original ask was to persist each chat's search results and message data, not just the text. Even once writes worked, the persist calls only sent `role` and `content`. The `filters`, `listings`, `filtersApplied`, and `maxPricePerBed` fields were dropped, and the messages GET query did not select `metadata` either, so a reopened conversation would have lost its card grid.

**Fix, in `useChat.ts` and the messages route:**
- The user message persists `{ filters }` into `metadata`.
- The assistant message persists `{ listings, filtersApplied, filters, maxPricePerBed }` into `metadata`.
- The messages GET query now selects `metadata`.
- `selectConversation` rehydrates those fields from `metadata` when loading history, so a reopened conversation shows the filters and the card grid, not just the text.

---

## The correct flow, end to end

1. `proxy.ts` refreshes the session on every request, so the access token stays fresh and cookies are current.
2. A route calls `getUser()` and now reliably resolves the logged-in user (no race, no mock).
3. `POST /api/conversations` inserts a real row with `user_id = user.id`. The conversations RLS check passes and a real id is returned.
4. `POST /api/conversations/[id]/messages` inserts a message. The RLS INSERT check finds the real parent conversation, the `SECURITY DEFINER` trigger bumps `updated_at`, and `metadata` is saved.
5. On reload, `GET /api/conversations` lists the real rows, the on-mount effect auto-selects the most recent one and loads its messages via `fetchMessages`, and `metadata` is rehydrated back into filters and listings.

---

## Lessons (the summary)

1. **RLS and table grants are two independent gates.** Both must pass. `42501 permission denied for table X` means a missing GRANT. `new row violates row-level security policy for table X` means a failing RLS WITH CHECK. Same error family, different causes, different fixes.
2. **Never let a dev convenience run before the real path, and prefer failing loud over silent mocks.** The mock that returned a fake id (rather than a 401) is what let a ghost conversation propagate and corrupt every downstream insert.
3. **Always inspect the database client's returned `error`.** Fire-and-forget writes that ignore `{ error }` hid the real failure for two full rounds.
4. **Middleware session refresh must run in every environment.** Token refresh is free and sends no email. Skipping it in dev is what created the stale-token race.
5. **Rotating refresh tokens plus concurrent requests equal races** unless the refresh is centralized in middleware. Do not refresh ad hoc from many routes at once.
6. **Read the timings.** A 2 ms "success" against a cloud database is a signal that you hit a mock, not the database.
7. **A write path and a read path are two features, not one.** Persisting rows and loading them back are separate, and "selecting" a conversation and "loading its messages" were separate actions too. Verify the full round trip (send, refresh, reopen), not just that the row appears in the table.

---

## Files touched

| File | What changed |
|------|--------------|
| `frontend/proxy.ts` | Session refresh now runs on every request including dev; only the launch-mode gating is skipped in dev. |
| `frontend/app/api/conversations/route.ts` | Auth check before mock (R1), then error surfacing (R2), then mock removed and a real 401 returned (R4). |
| `frontend/app/api/conversations/[id]/messages/route.ts` | Same as above, plus the GET query now selects `metadata`. |
| `frontend/hooks/useChat.ts` | Persist `metadata` (filters, listings, search results) and log any persist failure loudly. Added a shared `fetchMessages` helper so the on-mount effect loads the auto-selected conversation's history (R5), not just sets it active. |
| Supabase SQL (Step 2.1) | Added table `GRANT`s for `authenticated`; made `touch_conversation` `SECURITY DEFINER` with a pinned `search_path`; added a grants verification query. |

---

← [Step 2: Database + API Routes](step-2-database-api-routes.md)
