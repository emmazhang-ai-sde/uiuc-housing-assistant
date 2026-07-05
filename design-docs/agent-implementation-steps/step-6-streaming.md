# Step 6: Streaming Response Rendering

**Created: 2026-06-28**

← Back to [Agent Architecture](agent-architecture.md)

**Status: 🔜 Not started**

---

## Goal

Stream the agent's response token-by-token from the Python backend to the browser. The assistant bubble appears immediately and fills in as tokens arrive, instead of waiting for the full response.

Streaming concept and frontend spec are in [Layer 2: Backend](layer-2-backend.md) and [Layer 3: Frontend](layer-3-frontend.md).

---

## 6.1 — Backend: SSE Streaming Endpoint

Add a `/chat/stream` endpoint to `backend/main.py` using FastAPI's `StreamingResponse` and LangChain's `astream_events`:

```python
from fastapi.responses import StreamingResponse
import json

@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    # Rebuild memory from history (same as Step 3)
    memory.clear()
    for msg in req.history:
        if msg["role"] == "user":
            memory.chat_memory.add_user_message(msg["content"])
        else:
            memory.chat_memory.add_ai_message(msg["content"])

    async def generate():
        async for event in agent_executor.astream_events(
            {"input": req.message},
            version="v2",
        ):
            if event["event"] == "on_chat_model_stream":
                chunk = event["data"]["chunk"].content
                if chunk:
                    yield f"data: {json.dumps({'token': chunk})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
```

---

## 6.2 — Frontend: Streaming in `useChat.ts`

Replace the `fetch("/api/chat")` + `await res.json()` block in `sendMessage` with a streaming reader:

```typescript
const response = await fetch("/api/chat/stream", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ conversation_id: activeId, message: content, history }),
})

const reader = response.body!.getReader()
const decoder = new TextDecoder()

// Insert empty assistant bubble immediately
const placeholderId = crypto.randomUUID()
setMessagesByConv(prev => ({
  ...prev,
  [activeId]: [
    ...(prev[activeId] ?? []),
    { id: placeholderId, role: "assistant", content: "", created_at: new Date().toISOString() },
  ],
}))

let fullContent = ""
while (true) {
  const { done, value } = await reader.read()
  if (done) break
  const lines = decoder.decode(value).split("\n").filter(l => l.startsWith("data:"))
  for (const line of lines) {
    const payload = line.replace("data: ", "").trim()
    if (payload === "[DONE]") break
    const { token } = JSON.parse(payload)
    fullContent += token
    // Update the placeholder bubble in place
    setMessagesByConv(prev => ({
      ...prev,
      [activeId]: (prev[activeId] ?? []).map(m =>
        m.id === placeholderId ? { ...m, content: fullContent } : m
      ),
    }))
  }
}

// Persist the completed assistant message to DB
await fetch(`/api/conversations/${activeId}/messages`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ role: "assistant", content: fullContent }),
})
```

---

## 6.3 — Next.js Proxy Route Update

Update `frontend/app/api/chat/route.ts` to forward the streaming response:

```typescript
export async function POST(req: NextRequest) {
  const body = await req.json()
  const upstream = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  // Pass the ReadableStream through directly
  return new Response(upstream.body, {
    headers: { "Content-Type": "text/event-stream" },
  })
}
```

---

← [Step 5: nearby_places Tool](step-5-nearby-places.md)
