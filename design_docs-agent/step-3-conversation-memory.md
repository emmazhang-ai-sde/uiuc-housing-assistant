# Step 3: Conversation Memory

**Created: 2026-06-28**

← Back to [Agent Architecture](agent-architecture.md)

**Status: ✅ Complete**

---

## Goal

Pass conversation history from the frontend to the Python backend so the backend can resolve multi-turn references (e.g. "那附近" → location from a previous message, "what about 2BR?" → beds=2 applied on top of existing filters).

History is already stored in Supabase (Step 2). This step wires it into the RAG chain.

Memory design rationale is in [Layer 2: Backend](layer-2-backend.md).

---

## Why Not `ConversationBufferMemory`

The original plan proposed `ConversationBufferMemory` — a LangChain utility that stores history in Python process memory and automatically injects it into every LLM call.

We don't use it for two reasons:

**1. History is already in Supabase.**
`ConversationBufferMemory` was designed for apps where history has nowhere else to live (terminal scripts, Streamlit sessions). Since Step 2 stores every message in Supabase and the frontend loads it into `messagesByConv[activeId]`, we already have the history. We just need to send it with each request.

**2. Our LLM calls have strict output formats.**
The `rag_chain.py` pipeline has two LLM calls:
- `extract_filters(query)` → must output strict JSON (`{"beds": 1, "location_hint": "green st", ...}`)
- `summarize(query, listings, filters)` → must output exactly one sentence

Auto-injecting history into both prompts (what `ConversationBufferMemory` does) would break the JSON output of `extract_filters`. We only need history in `extract_filters`, and only as a short text block — not as a managed memory object.

**The actual solution:** add a `history` parameter to `extract_filters()` and prepend the last few exchanges as plain text before the user's current question.

---

## 3a — Update `rag_chain.py` (Inject History into EXTRACT_PROMPT)

**Why this step is needed:** `extract_filters` sees only the current message. In a multi-turn conversation, users drop context they already stated — "那附近" has no meaning unless the model can see that "near Grainger" was mentioned two messages ago. Without history in the prompt, every query is treated as if the conversation just started, so follow-up questions produce wrong or empty filters. Prepending the last few exchanges gives the LLM enough context to carry filter state across turns without requiring any persistent memory object.

`extract_filters` extracts search filters from what the user says. But in a multi-turn conversation, users often omit context they already stated earlier:

| Turn | User says | `extract_filters` sees (no history) | Should extract |
|------|-----------|-------------------------------------|----------------|
| 1 | "Show me 1BR near Grainger" | `{"beds": 1, "location_hint": "grainger"}` | ✅ correct |
| 2 | "What about 2BR?" | `{"beds": 2}` | ❌ loses location |
| 3 | "那附近便宜点的呢" | `{}` | ❌ nothing at all |

"那附近", "what about 2BR", "cheaper ones" — these phrases mean nothing without prior context. By prepending the last few exchanges to the prompt, the LLM can infer that location is still Grainger and only beds changed.

`summarize()` does not need history — its job is to write one sentence about the current search results. History is noise there and could break its output format.

In `rag/rag_chain.py`, update `extract_filters()` to accept a `history` list and prepend it to the prompt:

```python
def extract_filters(query: str, history: list[dict] | None = None) -> dict:
    history_text = ""
    if history:
        lines = []
        for msg in history[-6:]:   # last 3 exchanges (6 messages)
            role = "User" if msg["role"] == "user" else "Assistant"
            lines.append(f"{role}: {msg['content']}")
        history_text = "\n".join(lines) + "\n\n"

    prompt = f"""{history_text}Extract search filters from the following housing query as JSON.
Return only valid JSON with these keys (omit keys you cannot infer):
beds, baths, max_price, location_hint, property_type, availability_window

Query: {query}
JSON:"""

    result = llm.invoke(prompt)
    # ... existing JSON parsing logic unchanged ...
```

No changes to `summarize()` — it doesn't need history context.

---

## 3b — Update FastAPI Endpoint

**Why this step is needed:** The existing `/api/search` endpoint takes a single query and has no concept of conversation history — it was designed for the standalone search panel, not for chat. The chat flow needs a separate endpoint (`POST /chat`) that accepts `conversation_id`, `message`, and `history` so it can pass history to `extract_filters`. Keeping it separate from `/api/search` also means the search panel and chat panel can evolve independently.

In `backend/main.py`, add a `POST /chat` endpoint that accepts full history from the frontend and passes it to `extract_filters`.

```python
from pydantic import BaseModel

class ChatRequest(BaseModel):
    conversation_id: str
    message: str
    history: list[dict] = []   # [{"role": "user"|"assistant", "content": str}]

@app.post("/chat")
async def chat(req: ChatRequest):
    filters = extract_filters(req.message, history=req.history)
    answer = run_rag(req.message, filters)   # existing RAG logic
    return {"answer": answer, "filters": filters}
```

**Why stateless:** The backend holds no session state between requests. The frontend sends the full history on every call; the backend uses it and discards it. No memory objects, no session leak risk, trivially scalable.

---

## 3c — Update `useChat.ts` (Replace Mock with Real Backend Call)

**Why this step is needed:** Step 2 left a placeholder in `sendMessage` — a hardcoded 1.2-second delay followed by a fixed reply string. This was intentional scaffolding so the UI could be built and tested before the real backend was ready. Step 3 closes that gap: the mock is replaced with a real `fetch` call to `/api/chat`, and the conversation history captured before the optimistic update is sent along so the backend has full context for the current turn.

In [`frontend/hooks/useChat.ts`](../frontend/hooks/useChat.ts), replace the mock delay block with a real call to `POST /api/chat`:

```typescript
// Replace this block in sendMessage:
//   await new Promise(resolve => setTimeout(resolve, 1200))
//   const answer = MOCK_REPLY

// With:
const history = (messagesByConv[activeId] ?? []).map(m => ({
  role: m.role,
  content: m.content,
}))

const res = await fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    conversation_id: activeId,
    message: content,
    history,
  }),
})
const { answer } = await res.json()
```

Note: `history` is sent **before** the current user message is included — the backend sees the prior context, then the current query.

---

## 3d — Next.js Proxy Route `/api/chat`

**Why this step is needed:** The browser cannot call the Python backend directly. The frontend runs on port 3000 and the backend on port 8000 — a different origin. A direct `fetch("http://localhost:8000/chat")` from the browser would be blocked by CORS, and even if allowed, the Supabase session cookie (HTTP-only, same-origin) would not be sent cross-origin. The Next.js proxy route runs server-side on the same origin as the frontend, so it can read the cookie, verify the user with Supabase, and then forward the request to the backend — keeping auth out of the client entirely.

Add `frontend/app/api/chat/route.ts` to proxy requests from the Next.js frontend to the Python backend. This is required (not optional) because the Python backend runs on a different port and cannot share the Next.js session cookie directly.

```typescript
import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const body = await req.json()
  const res = await fetch(`${process.env.BACKEND_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  return NextResponse.json(data)
}
```

`BACKEND_URL` is set in `.env.local` (e.g. `http://localhost:8000` for local dev). The auth check here ensures only logged-in users can reach the Python backend.

---

## Files to Touch

| File | Change |
|------|--------|
| `rag/rag_chain.py` | Add `history` param to `extract_filters()`, prepend as text |
| `backend/main.py` | Add `POST /chat` endpoint accepting `history` |
| `frontend/hooks/useChat.ts` | Replace mock with `fetch("/api/chat", ...)` |
| `frontend/app/api/chat/route.ts` | New — Next.js proxy to Python backend |

---

## Deferred to Later Steps

| Item | Deferred to |
|------|------------|
| Upgrade to full `AgentExecutor` | Step 4 |
| `nearby_places` tool | Step 5 |
| Streaming | Step 6 |
| Auto-title conversation via LLM | Step 3 / Step 4 (needs real backend first — now available) |
