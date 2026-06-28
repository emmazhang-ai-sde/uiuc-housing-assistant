# Step 4: AgentExecutor + housing_search Tool

**Created: 2026-06-28**

← Back to [Agent Architecture](agent-architecture.md)

**Status: 🔜 Not started**

---

## Goal

Upgrade from the current `RetrievalQA` chain to a full `AgentExecutor`. The agent decides when to call the `housing_search` tool (ChromaDB vector search) based on the user's question — rather than always calling it unconditionally.

Tool design rationale and upgrade path overview are in [Layer 2: Backend](layer-2-backend.md).

---

## 4a — Wrap Existing Retriever as a Tool

The existing ChromaDB retriever becomes the `housing_search` tool. No data migration needed.

```python
from langchain.tools import Tool
from langchain.chains import RetrievalQA

retrieval_chain = RetrievalQA.from_chain_type(
    llm=llm,
    retriever=vectorstore.as_retriever(search_kwargs={"k": 5}),
)

housing_search_tool = Tool(
    name="housing_search",
    func=retrieval_chain.run,
    description=(
        "Search the UIUC housing database. Use this for questions about "
        "apartments, lease terms, landlords, neighborhoods, prices, and "
        "anything related to housing near UIUC."
    ),
)
```

---

## 4b — Build AgentExecutor

```python
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

tools = [housing_search_tool]  # nearby_places added in Step 5

prompt = ChatPromptTemplate.from_messages([
    ("system", (
        "You are a helpful housing assistant for students at the University of Illinois "
        "Urbana-Champaign. Help users find apartments, understand lease terms, and "
        "explore the neighborhood. When the user refers to a location mentioned earlier "
        "in the conversation, use that context to answer accurately."
    )),
    MessagesPlaceholder(variable_name="chat_history"),
    ("human", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad"),
])

agent = create_openai_tools_agent(llm, tools, prompt)

agent_executor = AgentExecutor(
    agent=agent,
    tools=tools,
    memory=memory,
    verbose=True,
    return_intermediate_steps=False,
)
```

---

## 4c — Replace Chain Call in Endpoint

In `backend/main.py`, replace the existing `RetrievalQA.run()` or `summarize()` call with `agent_executor.invoke()`:

```python
# Before (Step 3):
result = some_chain.run(req.message)

# After (Step 4):
result = agent_executor.invoke({"input": req.message})
return {"answer": result["output"]}
```

---

## Upgrade Path (No Data Migration)

1. Keep the existing `vectorstore` and `retriever` — wrap as `housing_search` tool ✓
2. `ConversationBufferMemory` already added in Step 3 ✓
3. Build `AgentExecutor` with `[housing_search_tool]`
4. Replace old chain call with `agent_executor.invoke()`
5. Add `nearby_places` tool in Step 5

The ChromaDB data and embedding pipeline are untouched throughout.

---

## Deferred to Later Steps

| Item | Deferred to |
|------|------------|
| `nearby_places` tool | Step 5 |
| Streaming | Step 6 |
