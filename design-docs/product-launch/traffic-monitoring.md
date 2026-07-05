# Concurrency Throttling & Traffic Monitoring

**Created: 2026-07-02**

Protects the shared Groq API quota from concurrent bursts, and gives basic
visibility into how much traffic the backend is handling. Complements
[`message-quota.md`](./message-quota.md), which caps abuse *per user per
day*; this doc addresses a different failure mode entirely — many different
users hitting `/chat` in the same few seconds.

---

## 1. Why this is a separate problem from the daily quota

Groq's RPM/TPM/RPD limits apply to the whole API key, per time window, not
per user. 100 users messaging over the course of an hour spreads load thin
enough to likely stay under the per-minute window. 100 users messaging in the
same 10 seconds can blow through the RPM/TPM window instantly regardless of
anyone's daily count — Groq starts returning 429s, and today's code
(`backend/main.py:320-331`) only retries the specific `tool_use_failed` case,
so a burst just surfaces as scattered "assistant ran into an error" replies.

Per-user daily quotas do nothing to prevent this, since the failure is about
*simultaneity*, not volume from any one person.

## 2. Concurrency cap on `/chat`

Add an `asyncio.Semaphore(N)` in `backend/main.py`, acquired around the
`agent.ainvoke()` call(s) in the `/chat` handler:

```python
_chat_semaphore = asyncio.Semaphore(int(os.getenv("MAX_CONCURRENT_CHATS", "5")))

@app.post("/chat")
async def chat(req: ChatRequest, _=Depends(verify_token)):
    ...
    try:
        async with asyncio.timeout(20):
            async with _chat_semaphore:
                result = await agent.ainvoke(payload, config=config)
                ...
    except TimeoutError:
        # falls through to the existing generic error response (§3) —
        # no special "high traffic" copy, see rationale below
        ...
```

**Design choice: queue, don't reject outright.** Requests beyond the `N`
concurrent slots simply wait for the semaphore rather than getting an
immediate distinct "system busy" response. The frontend already shows a
loading/typing indicator while `isLoading` is true (`useChat.ts`), so a
queued request just looks like a slightly slower reply — no new UI state or
copy is needed, and no user is told the system is struggling. This was a
deliberate choice after discussion: singling out a "we're experiencing high
traffic" message was judged worse for UX than just taking a bit longer.

**Bounded wait, not unbounded.** A pure semaphore queue with no timeout risks
requests hanging until the Next.js proxy (`/api/chat/route.ts`) or the
hosting platform's function-execution limit kills the connection, which
produces a *worse*, unhandled error than a clean one. Wrapping the wait in
`asyncio.timeout(...)` bounds it; a timeout falls into the same `except
Exception` branch `/chat` already has (`backend/main.py:355-363`), which
returns the existing generic "Sorry, the assistant ran into an error" — reusing
that path means no new user-facing copy at all, just the existing failure
message, consistent with not calling out traffic specifically.

`MAX_CONCURRENT_CHATS` is an env var so it can be tuned against Groq's actual
plan limits without a code change.

## 3. Traffic visibility

No Prometheus/Grafana — disproportionate for this project's scale. Track two
in-memory counters in `backend/main.py` and expose them by extending the
existing `/api/status` endpoint (already used by the frontend to show scrape
freshness, so this is additive, not a new route):

```python
_active_chats = 0          # currently inside the semaphore
_chat_timestamps: list[float] = []   # start times of /chat calls, last 5 min

@app.get("/api/status")
def status():
    ...
    now = time.time()
    recent = [t for t in _chat_timestamps if now - t < 300]
    result["active_chats"] = _active_chats
    result["chats_last_5min"] = len(recent)
    return result
```

Increment/append at the top of `/chat`, decrement/prune on completion. This
is enough to eyeball load during a demo or spot a spike after the fact — it's
process-local (resets on backend restart, doesn't survive multiple worker
processes), which is an accepted limitation at this scale rather than a gap
to solve with Redis.

Optionally, log a single structured line per `/chat` call (start time,
duration, whether it timed out waiting on the semaphore) so a burst is
visible in the backend's existing logs without needing the `/api/status`
fields at all — cheaper to add, useful for post-hoc debugging even if the
in-memory counters are never looked at live.

## 4. Relationship to `message-quota.md`

Two independent levers, both worth having:

| | Per-user daily quota | Concurrency cap |
|---|---|---|
| Protects against | one user hammering the app all day | many users arriving at once |
| Enforced in | Next.js `messages` route (Supabase) | FastAPI `/chat` (semaphore) |
| Failure mode without it | one user silently exhausts the shared Groq quota over a day | a burst causes simultaneous 429s / errors for everyone |

They can be implemented independently; neither depends on the other's schema
or code path.

## 5. Verification

1. Set `MAX_CONCURRENT_CHATS=2` locally.
2. Fire 4 concurrent requests at `/chat` (e.g. a small script with
   `asyncio.gather`, or 4 browser tabs sending at once).
3. Confirm only 2 run `agent.ainvoke()` at a time (add a temporary print
   inside the semaphore block) and the other 2 complete shortly after instead
   of failing.
4. Hit `/api/status` during the burst and confirm `active_chats` /
   `chats_last_5min` reflect it.
5. Lower `asyncio.timeout(...)` to something small (e.g. 1s) temporarily and
   confirm a timed-out request returns the existing generic error message,
   not a new one.
6. Reset both env vars to real values before merging.
