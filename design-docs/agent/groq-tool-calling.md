# Step 3: Conversation Memory & Tool Calling

*(filed under the working title "Groq Tool Calling: Format Issue & Model Analysis")*

**Created: 2026-06-28**
**Updated: 2026-06-29** — added "Understanding Function Calling: A Second `tool_use_failed` Trigger"
**Updated: 2026-07-03** — absorbed the old `step-3-conversation-memory.md` and `step-4-agent-executor.md`, which described the original plan and had gone stale (wrong API, "Not started" status) next to what actually shipped. This doc is now the single source of truth for both memory mechanisms.

← Back to [Agent Architecture](agent-architecture.md)

**Status: ✅ Complete**

---

## Overview: Two Separate Memory Mechanisms

The agent's "memory" is actually two independent pieces solving two different problems — don't conflate them:

| | Problem it solves | How | Owned by |
|---|---|---|---|
| **History → `extract_filters`** | The NL filter-extraction call is a standalone LLM call outside the agent graph — it needs multi-turn context to resolve things like "那附近" or "what about 2BR?" | Frontend sends the full `history` array on every request; backend prepends it as plain text before the prompt | Stateless — rebuilt from the request every time |
| **`MemorySaver` checkpointer** | The agent itself needs to remember the whole conversation to decide when/how to call `housing_search` | LangGraph's `MemorySaver`, keyed by `thread_id` (= `conversation_id`) | Stateful — lives server-side in the checkpointer |

Both run in the same `/chat` request. They don't share state with each other — `extract_filters` never sees the checkpointer's messages, and the agent never sees `extract_filters`'s history text.

---

## Conversation Memory: History → `extract_filters`

**Why not `ConversationBufferMemory`:** `ConversationBufferMemory` auto-injects history into *every* LLM call. But `rag_chain.py` has two LLM calls with strict output formats — `extract_filters(query)` must output JSON, `summarize(...)` must output exactly one sentence. Auto-injecting history into both would break `extract_filters`'s JSON output. Only `extract_filters` needs history, and only as a short text block prepended to its own prompt — not a managed memory object.

Without history, every query is treated as if the conversation just started:

| Turn | User says | `extract_filters` sees (no history) | Should extract |
|------|-----------|-------------------------------------|----------------|
| 1 | "Show me 1BR near Grainger" | `{"beds": 1, "location_hint": "grainger"}` | ✅ correct |
| 2 | "What about 2BR?" | `{"beds": 2}` | ❌ loses location |
| 3 | "那附近便宜点的呢" | `{}` | ❌ nothing at all |

`summarize()` does **not** get history — its job is one sentence about the current results; history there is noise that could break its output format.

Current implementation, in `rag/rag_chain.py`:

```python
def extract_filters(query: str, history: list[dict] | None = None) -> dict:
    # [Step 3] Prepend last 3 exchanges so the LLM can resolve multi-turn references
    # (e.g. "那附近" → location from a previous message, "what about 2BR?" → keep prior filters)
    history_text = ""
    if history:
        lines = []
        for msg in history[-6:]:   # last 3 exchanges (6 messages)
            role = "User" if msg["role"] == "user" else "Assistant"
            lines.append(f"{role}: {msg['content']}")
        history_text = "Recent conversation:\n" + "\n".join(lines) + "\n\n"

    raw = _extract_chain.invoke({"query": query, "history": history_text})
    try:
        return parse_json_output(raw)
    except Exception:
        return {}
```

The frontend (`useChat.ts`) captures `history` from `messagesByConv[activeId]` before the optimistic UI update and sends it on every `/api/chat` call; `backend/main.py`'s `/chat` endpoint passes it straight through to `extract_filters(req.message, req.history)`. This is stateless by design — no session state on the backend, no memory-leak risk, trivially scalable.

---

## Problem

When using `langgraph.prebuilt.create_react_agent` with Llama models on Groq, the model generates tool calls in Llama's native XML format instead of the OpenAI JSON format that the Groq API expects.

**Failing output (what the model generated):**
```
<function=housing_search>{"query": "1 bedroom under $900"}</function>
```

**Expected output (OpenAI JSON tool call format):**
```json
{"name": "housing_search", "arguments": {"query": "1 bedroom under $900"}}
```

Groq's API validates the model's output against the tools defined in the request. Since the Llama XML format doesn't match any tool name, Groq returns:

```
groq.BadRequestError: 400 - tool_use_failed
"Failed to call a function. Please adjust your prompt."
```

---

## Root Cause: Two separate issues

**Issue 1 — Wrong LangChain API.** `langgraph.prebuilt.create_react_agent` constructs the message payload in a way that triggers Llama's built-in function-call training, causing it to output the `<function=...>` format. Calling `llm.bind_tools([tool]).invoke(...)` directly produces valid OpenAI JSON tool calls — the bug is specific to how `create_react_agent` structures the prompt. Additionally, this function is deprecated as of LangGraph 1.0:

```
LangGraphDeprecatedSinceV10: create_react_agent has been moved to `langchain.agents`.
Please update your import to `from langchain.agents import create_agent`.
```

**Issue 2 — Model training.** Even after switching to the correct API (`create_agent`), `llama-3.1-8b-instant` still produces the `<function=...>` format. This is a model-level issue: Llama 3.1 was trained with the XML function-call format. Switching to the correct API fixes the prompt structure problem but does not retrain the model.

---

## API Fix

Replace `langgraph.prebuilt.create_react_agent` with `langchain.agents.create_agent`. The new API uses `system_prompt` instead of `prompt`:

```python
# Before (broken)
from langgraph.prebuilt import create_react_agent
agent = create_react_agent(llm, tools=tools, checkpointer=checkpointer, prompt=system_str)

# After (fixed)
from langchain.agents import create_agent
agent = create_agent(llm, tools=tools, checkpointer=checkpointer, system_prompt=system_str)
```

This fixes the issue for models that support OpenAI-style tool calling (Llama 4, Llama 3.3). It does not fix `llama-3.1-8b-instant`.

---

## Model Analysis

All available Groq free-tier models were evaluated for tool calling compatibility with `langchain.agents.create_agent`.

### `llama-3.1-8b-instant` ❌

Produces Llama 3.1 native XML format that Groq API rejects. Fails with `BadRequestError 400 tool_use_failed`. Issue persists with both `create_react_agent` and `create_agent` — it is a model-level training issue. Not usable for the agent.

### `llama-3.3-70b-versatile` ✅

Tool calling works correctly with `create_agent`. Verified end-to-end with real `housing_search` tool.

**Drawback:** Exhausted the 100k TPD (tokens per day) free-tier limit in a single debugging session. Not sustainable.

### `meta-llama/llama-4-scout-17b-16e-instruct` ✅ — **current default**

Tool calling works correctly with `create_agent`. Verified end-to-end with real `housing_search` tool returning 50 listings and a grounded answer. Llama 4 follows OpenAI-style function calling natively.

### `qwen/qwen3-32b` — not tested

Low TPM (6,000/min). Skipped.

### `groq/compound-mini` — not tested

Groq's own compound model. Highest TPM (70,000/min). Untested for tool calling — candidate fallback if scout hits limits.

---

## Rate Limit Comparison (free tier)

| Model | tokens/min | req/min | Tool calling |
|-------|-----------|---------|-------------|
| `groq/compound-mini` | 70,000 | 250 | untested |
| `meta-llama/llama-4-scout-17b-16e-instruct` | 30,000 | 1,000 | ✅ |
| `llama-3.3-70b-versatile` | 12,000 | 1,000 | ✅ |
| `qwen/qwen3-32b` | 6,000 | 1,000 | untested |
| `llama-3.1-8b-instant` | 6,000 | 14,400 | ❌ |

Groq does not expose daily (TPD) limits in response headers — they only appear in the 429 error body when the limit is hit.

---

## Understanding Function Calling: A Second `tool_use_failed` Trigger

Everything above (Cause 1) is about the **format** of the tool call — the model emits the wrong syntax. There is a second, distinct way to hit the exact same `400 tool_use_failed`, and it's about the **content** of the turn. Understanding it requires understanding what function calling actually is.

### What function calling really is

An LLM cannot execute code. It only emits text. "Function calling" is a convention layered on top of that:

1. We describe our tools to the model as JSON schemas (name, description, parameters).
2. When the model "wants" to call a tool, it does not run anything. It emits a specially formatted block of text that *represents* a function call.
3. The runtime (Groq's API + LangChain) parses that text, runs the real Python function, and feeds the result back as a `tool` message.
4. The model reads the result on the next turn and writes a final natural-language answer.

So the model's output on any single turn is **one of two things**:
- a **final text answer** (no tool call), or
- a **pure tool call** (structured function-call text, and nothing else).

Groq enforces this either/or strictly. When `tool_choice="auto"` and the model signals it wants a tool, Groq's server-side parser expects the generation to be *only* a function call. If the generation also contains free text, the parse fails → `tool_use_failed`.

### The bug we hit (2026-06-29)

Our agent system prompt told the model: *"when you show listings, begin your reply with the token `[LISTINGS]`."* The intent was a UI signal — the frontend would see `[LISTINGS]` and render a card grid.

The problem: **"showing listings" is exactly the moment the agent calls `housing_search`.** So on the "go ahead" turn, the model tried to emit, in one generation:

```
[LISTINGS]\n                      ← free text our prompt demanded
<tool call to housing_search>     ← the actual function call
```

Groq saw text mixed into a tool-calling generation and rejected the whole thing:

```
400 tool_use_failed
failed_generation: '[LISTINGS]\n'
```

This is why it *looked* intermittent: turns that only asked clarifying questions were pure text and worked fine. The crash appeared **only on the first turn that called a tool** — every time, reliably, but disguised as randomness because the early turns succeeded.

### Cause 1 vs Cause 2 — same error, opposite fixes

| | Cause 1 (format) | Cause 2 (content) |
|---|---|---|
| What's wrong | Tool call emitted in Llama XML, not OpenAI JSON | Tool call polluted with extra free text |
| Trigger | Model trained on the wrong format (e.g. `llama-3.1`) | Prompt forces an in-band token on a tool-calling turn |
| `failed_generation` | `<function=...>{...}</function>` | `[LISTINGS]\n` |
| Fix | Use a model with native JSON tool calls (Llama 4) | Never require in-band markers on tool-calling turns |
| Unrelated to | — | which model writes the code (Sonnet/Opus); `MemorySaver` trimming |

### Design principle

**Never use an in-band text token to control the UI from a tool-calling agent.** A tool-calling turn must be pure. Derive UI state from the *structure* of the result messages, not from a magic string in the model's prose.

The fix scans the result messages for a `ToolMessage` named `housing_search` — if the tool ran this turn, show the grid:

```python
# backend/main.py — /chat endpoint
listings = []
for msg in result["messages"]:
    if isinstance(msg, ToolMessage) and msg.name == "housing_search":
        listings = msg.artifact or []
        break
```

No marker, no parsing of the model's text, no possibility of the Cause 2 crash. The agent's system prompt no longer mentions `[LISTINGS]` at all.

### The `messages` array is the real interface

This is the deeper lesson. The `messages` list is the entire contract between model, runtime, and tools:

| Message type | Carries |
|---|---|
| `system` | instructions / system prompt |
| `user` (`HumanMessage`) | the user's input |
| `assistant` (`AIMessage`) | the model's reply **or** a `tool_calls` request |
| `tool` (`ToolMessage`) | a tool's result, linked by `tool_call_id`, with the data in `.artifact` |

A tool-calling turn produces an `AIMessage` with `tool_calls`; the runtime appends a `ToolMessage` with the result; the next model call sees both. **UI signals belong in that structure** — message types, tool names, artifacts — not smuggled inside the assistant's natural-language text. The moment you ask the model to emit a control token in its prose, you have coupled UI state to the one part of the system Groq refuses to let you pollute on a tool-calling turn.

---

## Decision

**Use `meta-llama/llama-4-scout-17b-16e-instruct` as the agent LLM.**

- 17B — significantly smaller than 70B, lower token cost per request
- 30k tokens/min — 2.5× higher TPM than 70b
- Tool calling verified with real `housing_search` artifact flow
- Answers grounded in real listing data, no hallucination observed

`rag_chain.py` continues to use `llama-3.1-8b-instant` for `extract_filters` and `summarize` on the `/api/search` endpoint — those functions do not require tool calling and are unaffected.

If scout hits limits, try `groq/compound-mini` next before falling back to 70b.

---

## Affected Files

**History → `extract_filters`:**
- `rag/rag_chain.py` — `extract_filters()` accepts `history` and prepends it to the prompt.
- `frontend/hooks/useChat.ts` — captures `history` from `messagesByConv` before the optimistic update, sends it on every `/api/chat` call.
- `backend/main.py` (`/chat`) — passes `req.history` through to `extract_filters`.

**Cause 1 (format / model selection):**
- `rag/agent.py` — model selection block and `create_agent` call.

**Cause 2 (in-band token removal, 2026-06-29):**
- `rag/agent.py` — removed the `[LISTINGS]` instruction from the system prompt; the prompt now states the UI renders the grid automatically when `housing_search` runs.
- `backend/main.py` (`/chat`) — replaced the `"[LISTINGS]" in raw_answer` text check with a scan for a `housing_search` `ToolMessage`.
