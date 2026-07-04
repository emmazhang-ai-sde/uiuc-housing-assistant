# Step 5: nearby_places Tool (Google Maps)

**Created: 2026-06-28**

← Back to [Agent Architecture](agent-architecture.md)

**Status: 🔜 Not started**

---

## Goal

Add a second tool to the `AgentExecutor` that can look up nearby places (restaurants, grocery stores, gyms, transit stops, etc.) via the Google Maps Places API. The agent calls this tool when the user asks about the surrounding area rather than about listings.

Tool design rationale is in [Layer 2: Backend](layer-2-backend.md).

---

## 5.1 — Implement the Tool Function

```python
import requests
from langchain.tools import Tool

GOOGLE_MAPS_API_KEY = os.environ["GOOGLE_MAPS_API_KEY"]

def search_nearby_places(query: str) -> str:
    """
    Expected query format: "<place type> near <location>, Champaign IL"
    Example: "grocery stores near Campustown, Champaign IL"
    """
    endpoint = "https://maps.googleapis.com/maps/api/place/textsearch/json"
    params = {
        "query": query,
        "key": GOOGLE_MAPS_API_KEY,
        "region": "us",
    }
    res = requests.get(endpoint, params=params).json()
    results = res.get("results", [])[:5]
    if not results:
        return "No results found."
    lines = []
    for r in results:
        name = r.get("name")
        rating = r.get("rating", "N/A")
        address = r.get("formatted_address", "")
        lines.append(f"- {name} (rating: {rating}) — {address}")
    return "\n".join(lines)

maps_tool = Tool(
    name="nearby_places",
    func=search_nearby_places,
    description=(
        "Find places near a location in Champaign-Urbana. Use this when the user "
        "asks about restaurants, grocery stores, gyms, transit, or anything nearby "
        "a specific area or apartment. Input should be a natural language query "
        "like 'coffee shops near Green Street, Champaign IL'."
    ),
)
```

---

## 5.2 — Add to AgentExecutor

```python
# In Step 4, tools = [housing_search_tool]
# In Step 5, expand to:
tools = [housing_search_tool, maps_tool]

# Re-create AgentExecutor with updated tools list
agent = create_openai_tools_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, memory=memory, verbose=True)
```

---

## 5.3 — Environment Variable

```bash
GOOGLE_MAPS_API_KEY=your-key
```

Add to Railway backend env vars and local `.env`.

---

## Deferred to Later Steps

| Item | Deferred to |
|------|------------|
| Streaming | Step 6 |
| Displaying nearby places on the map view | Future / icebox |

---

← [Step 3: Conversation Memory & Tool Calling](../agent/groq-tool-calling.md) · [Step 6: Streaming Response Rendering](step-6-streaming.md) →
