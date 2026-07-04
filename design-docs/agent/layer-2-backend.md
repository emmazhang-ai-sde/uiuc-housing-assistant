# Layer 2: Backend — RAG to LangChain Agent

**Created: 2026-06-25**

← Back to [Agent Architecture](agent-architecture.md)

---

## Goal

Upgrade the current single-turn RAG chain into a multi-turn conversational agent that can remember context across messages and call multiple tools — starting with vector search and Google Maps Places.

---

## Current vs Target

```
Current:
  user query → retriever → LLM → answer

Target:
  user query + conversation history → Agent → [decide which tool(s) to call]
                                             ↓
                              tool results → LLM → answer
```

---

## Memory: ConversationBufferMemory

`ConversationBufferMemory` stores the raw message history and injects it into every LLM call, allowing the agent to resolve references like "那附近" (nearby there) back to a location mentioned earlier.

**Window size:** For housing Q&A, the last 10 messages (5 exchanges) is sufficient. `ConversationBufferWindowMemory(k=5)` caps token usage if needed.

**Stateless pattern:** The backend holds no session state between requests. The frontend sends the full conversation history on every call; the backend rebuilds memory from it each time. Simpler to scale, no in-memory session leak risk.

Implementation code is in [Step 3](groq-tool-calling.md) — superseded in practice by history injection into `extract_filters` + a LangGraph `MemorySaver` checkpointer, not `ConversationBufferMemory`. See that doc for the actual design.

---

## Tools

### Tool 1: `housing_search` — Vector Search (existing RAG)

Wraps the current ChromaDB retriever as a LangChain Tool. The agent calls this for questions about apartments, prices, lease terms, or landlords.

The tool description is what the agent reads to decide when to call it — write it to cover all question types the data can answer.

No data migration needed: the existing `vectorstore` and retriever are reused as-is.

Implementation code is in [Step 3](groq-tool-calling.md) — superseded in practice: `create_agent` (not `create_openai_tools_agent`), no `MessagesPlaceholder`. See that doc for the actual design.

### Tool 2: `nearby_places` — Google Maps Places API

Called when the user asks about places near a location — restaurants, grocery stores, gyms, transit stops, etc. Input is a natural-language query; output is a short list of place names, ratings, and addresses.

Implementation code is in [Step 5](step-5-nearby-places.md).

---

## AgentExecutor

Uses `create_openai_tools_agent` with a system prompt that establishes the assistant's role and instructs it to use conversation context when resolving location references.

`MessagesPlaceholder(variable_name="chat_history")` injects the memory into the prompt on each call.

Implementation code is in [Step 3](groq-tool-calling.md) — superseded in practice: `create_agent` (not `create_openai_tools_agent`), no `MessagesPlaceholder`. See that doc for the actual design.

---

## Streaming

The `/chat/stream` endpoint uses FastAPI's `StreamingResponse` and LangChain's `astream_events` to emit tokens as Server-Sent Events. The frontend reads the stream and fills the assistant bubble token-by-token.

Implementation code is in [Step 6](step-6-streaming.md).

---

## Upgrade Path from Current RAG

1. Keep existing `vectorstore` + `retriever` — wrap as `housing_search` tool (Step 4)
2. Add `ConversationBufferMemory` and update FastAPI endpoint to accept `history` (Step 3)
3. Build `AgentExecutor` with `housing_search` tool (Step 4)
4. Add `nearby_places` tool (Step 5)
5. Add streaming endpoint (Step 6)

The ChromaDB data and embedding pipeline are untouched throughout.

---

## Environment Variables

```bash
GOOGLE_MAPS_API_KEY=your-key
OPENAI_API_KEY=your-key   # or whichever LLM provider is in use
```
