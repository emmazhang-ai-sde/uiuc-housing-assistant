# Groq Tool Calling: Format Issue & Model Analysis

**Created: 2026-06-28**

← Back to [Agent Architecture](agent-architecture.md)

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

## Decision

**Use `meta-llama/llama-4-scout-17b-16e-instruct` as the agent LLM.**

- 17B — significantly smaller than 70B, lower token cost per request
- 30k tokens/min — 2.5× higher TPM than 70b
- Tool calling verified with real `housing_search` artifact flow
- Answers grounded in real listing data, no hallucination observed

`rag_chain.py` continues to use `llama-3.1-8b-instant` for `extract_filters` and `summarize` on the `/api/search` endpoint — those functions do not require tool calling and are unaffected.

If scout hits limits, try `groq/compound-mini` next before falling back to 70b.

---

## Affected File

`rag/agent.py` — model selection block and `create_agent` call.
