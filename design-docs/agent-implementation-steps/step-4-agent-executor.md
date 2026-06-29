# Step 4: AgentExecutor + housing_search Tool

**Created: 2026-06-28**

← Back to [Agent Architecture](agent-architecture.md)

**Status: 🔜 Not started**

---

## Goal

Upgrade from the current five-step chain to a full agent. The agent decides when to call the `housing_search` tool (ChromaDB vector search) based on the user's question — rather than always calling it unconditionally.

Tool design rationale and upgrade path overview are in [Layer 2: Backend](layer-2-backend.md).

---

## Design Decisions

### 1. New file `rag/agent.py` instead of adding to `rag_chain.py`

`rag_chain.py` is a Phase 6 product with a single, well-defined responsibility: extract → filter → retrieve → summarize. Adding agent logic would give it two completely different jobs. Keeping them separate means `rag_chain.py` functions can still be called independently by `/api/search` without interference.

### 2. `housing_search` as a tool

This is the core of the agent pattern: wrapping "search" as a tool lets the LLM decide whether and when to call it. The current `/chat` unconditionally runs the full pipeline on every request — even "hello" hits ChromaDB. With tool calling, the LLM only invokes `housing_search` when it determines the question requires a housing lookup; otherwise it answers directly. More efficient and more natural.

### 3. `MemorySaver` checkpointer as a singleton

LangGraph's `MemorySaver` uses `thread_id` to isolate each conversation's history. A single instance manages all conversations simultaneously. Previously `/chat` was stateless — the client sent the full `history` list on every request. Now history is maintained automatically server-side by the checkpointer, so the frontend no longer needs to send `history`.

---

## API Reality Check

The design originally referenced LangChain 0.x APIs (`AgentExecutor`, `create_openai_tools_agent`, `ConversationBufferMemory`). **None of these exist in the installed version.**

| Installed | Version |
|-----------|---------|
| `langchain` | 1.3.4 |
| `langchain-core` | 1.4.1 |
| `langchain-community` | 0.4.2 |
| `langgraph` | 1.2.4 |

LangChain 1.x is a complete redesign built on LangGraph. The correct APIs are:

| Old (0.x — not available) | New (1.x — use this) |
|---------------------------|----------------------|
| `AgentExecutor` | `langgraph.prebuilt.create_react_agent` |
| `create_openai_tools_agent` | `create_react_agent` (built-in tool calling) |
| `ConversationBufferMemory` | `langgraph.checkpoint.memory.MemorySaver` |
| `Tool(name=..., func=...)` | `@tool` decorator from `langchain_core.tools` |

---

## Implementation Notes

### 1. The tool wraps the existing pipeline — not RetrievalQA

The current codebase has no `RetrievalQA`. The actual retrieval logic is `get_filtered_docs + filter_by_location` in `rag/rag_chain.py`. The `housing_search` tool calls these directly, passing the user's query string through unchanged.

Do **not** call `extract_filters` inside the tool — that's a redundant LLM call. The agent itself understands the user's intent; the tool just needs to search and return raw listings.

Do **not** call `summarize` inside the tool either — the agent writes its own final response, replacing `summarize()` entirely for the `/chat` endpoint.

### 2. Getting `listings` back to the frontend

In LangGraph, tool results are stored as `ToolMessage` objects in the message list. If the tool returns a plain `list[dict]`, it gets serialized to a string in `ToolMessage.content` and the raw object is lost.

Solution: use `response_format="content_and_artifact"` on the tool. The tool returns `(str, list[dict])` — the string goes to the LLM for reasoning, the raw object is preserved in `ToolMessage.artifact`.

```python
@tool(response_format="content_and_artifact")
def housing_search(query: str) -> tuple[str, list[dict]]:
    ...
    return f"Found {len(listings)} listings.", listings
```

After `agent.invoke()`, extract listings from the message list:

```python
from langchain_core.messages import ToolMessage

listings = []
for msg in result["messages"]:
    if isinstance(msg, ToolMessage) and msg.name == "housing_search":
        listings = msg.artifact or []
        break
```

### 3. Memory via LangGraph checkpointer

`MemorySaver` replaces `ConversationBufferMemory`. Pass it as `checkpointer` when creating the agent, then pass `thread_id` per request. LangGraph manages the full message history automatically — no manual `history` list needed.

```python
from langgraph.checkpoint.memory import MemorySaver

checkpointer = MemorySaver()
agent = create_react_agent(llm, tools, checkpointer=checkpointer, ...)
```

Invoke per request:
```python
config = {"configurable": {"thread_id": req.conversation_id}}
result = agent.invoke({"messages": [HumanMessage(req.message)]}, config=config)
```

The `history: list[dict]` field on `ChatRequest` can be dropped after Step 4 — history is now owned server-side by the checkpointer. Keep it in the schema but ignore it during the transition.

### 4. Only `/chat` gets the agent — `/api/search` stays as-is

`/api/search` accepts explicit `FilterParams` from the UI filter panel, which bypass NL extraction. Keep its five-step pipeline (`extract_filters → merge_filters → build_where → get_filtered_docs → filter_by_location → summarize`) unchanged. The agent pattern only replaces `/chat`.

---

## 4a — Define `housing_search` Tool

New file: `rag/agent.py`

```python
from langchain_core.tools import tool
from rag.rag_chain import get_filtered_docs, filter_by_location

@tool(response_format="content_and_artifact")
def housing_search(query: str) -> tuple[str, list[dict]]:
    """Search the UIUC housing database. Use this for questions about
    apartments, lease terms, landlords, neighborhoods, prices, and
    anything related to housing near UIUC."""
    docs = get_filtered_docs(query, where=None)
    docs = filter_by_location(docs, location_hint=None)
    listings = [doc.metadata for doc in docs]
    return f"Found {len(listings)} listings.", listings
```

---

## 4b — Build Agent with MemorySaver

```python
from langchain_core.messages import SystemMessage
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.memory import MemorySaver

_checkpointer = MemorySaver()

_SYSTEM = SystemMessage(content=(
    "You are a helpful housing assistant for students at the University of Illinois "
    "Urbana-Champaign. Help users find apartments, understand lease terms, and "
    "explore the neighborhood. When the user refers to a location mentioned earlier "
    "in the conversation, use that context to answer accurately."
))

agent = create_react_agent(
    llm,
    tools=[housing_search],
    checkpointer=_checkpointer,
    prompt=_SYSTEM,
)
```

`_checkpointer` is a module-level singleton. LangGraph isolates history by `thread_id`, so a single `MemorySaver` instance serves all conversations safely.

---

## 4c — Replace Chain Call in `/chat` Endpoint

```python
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
from rag.agent import agent

@app.post("/chat")
async def chat(req: ChatRequest, _=Depends(verify_token)):
    config = {"configurable": {"thread_id": req.conversation_id}}
    result = agent.invoke(
        {"messages": [HumanMessage(content=req.message)]},
        config=config,
    )

    # Last message is the agent's final response
    answer = result["messages"][-1].content

    # Extract structured listings from the tool call artifact
    listings = []
    for msg in result["messages"]:
        if isinstance(msg, ToolMessage) and msg.name == "housing_search":
            listings = msg.artifact or []
            break

    return {
        "answer":          answer,
        "listings":        listings,
        "filters_applied": {},  # agent doesn't expose merged filters; populate in Step 5
    }
```

`/api/search` is unchanged.

---

## Upgrade Path (No Data Migration)

1. Create `rag/agent.py` — define `housing_search` tool + `agent` singleton
2. `MemorySaver` replaces per-`conversation_id` memory dict — LangGraph handles isolation via `thread_id`
3. Update `/chat` to call `agent.invoke()` with `thread_id` config
4. Parse answer from last `AIMessage`; parse listings from `ToolMessage.artifact`
5. Add `nearby_places` tool in Step 5

The ChromaDB data, embedding pipeline, and `/api/search` endpoint are untouched throughout.

---

## Deferred to Later Steps

| Item | Deferred to |
|------|------------|
| `nearby_places` tool | Step 5 |
| Streaming | Step 6 |
| Expose `filters_applied` from agent | Step 5 (when structured tool input is added) |
