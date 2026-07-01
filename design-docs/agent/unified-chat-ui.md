# Unified Chat UI: Merge /chat Agent with Full Search Experience

**Created: 2026-06-29**

## Problem

Two separate pages serve different parts of the product:

| Route | What it has | What it lacks |
|---|---|---|
| `/` (root) | Full EmptyState (hero + prompts), FilterPanel, card/table/map views, PropertyDrawer | Conversation history sidebar, multi-turn memory |
| `/chat` | ConversationSidebar with session history, multi-turn agent | EmptyState, FilterPanel, card/table/map views |

Users experience these as two disconnected tools. The goal is one surface: agent conversation memory + full search UI (filters, EmptyState, card/table/map views).

---

## Architecture Decision

**Keep `/chat` as the canonical page; graft the full search UI onto it. Leave `/` untouched.**

Rationale: the agent (`/chat`) is the product direction. The search page (`/`) is a legacy prototype that is easy to keep running as a fallback / comparison surface without any code change.

---

## Data Flow (after merge)

```
User types query + sets FilterPanel
        ↓
chat/page.tsx: sendMessage(content, filters)
        ↓
useChat.ts: POST /api/chat { conversation_id, message, history, filters }
        ↓
Next.js proxy → backend /chat
        ↓
backend sets ContextVar(_ui_filters) → invokes LangGraph agent
        ↓
housing_search tool reads _ui_filters → extract_filters(query) merged with UI filters
        ↓
agent returns { answer, listings, filters_applied }
        ↓
useChat stores enriched ChatMessage { content, listings, filters, filtersApplied, maxPricePerBed }
        ↓
ChatWindow renders:
  - user msg  → UserBubble (with ReadOnlyFilterSnapshot)
  - asst msg  → AssistantMessage (card/table/map + sort + distance)
```

---

## Changes by Layer

### Backend — `rag/agent.py`

Use Python `contextvars.ContextVar` to pass UI filters to the `housing_search` tool without changing its signature (LangGraph tools can't easily accept dynamic runtime state through arguments):

```python
from contextvars import ContextVar
_ui_filters: ContextVar[dict | None] = ContextVar("_ui_filters", default=None)

@tool(response_format="content_and_artifact")
def housing_search(query: str) -> tuple[str, list[dict]]:
    filters = _ui_filters.get() or {}
    where = build_where(merge_filters(extract_filters(query), filters))
    location_hint = filters.get("location_hint")
    docs = get_filtered_docs(query, where=where)
    docs = filter_by_location(docs, location_hint)
    listings = [doc.metadata for doc in docs]
    return _summarize_listings(listings), listings
```

### Backend — `backend/main.py`

`ChatRequest` accepts an optional `filters` field (same schema as `/api/search`). Before invoking the agent, set the context variable; reset it in a `finally` block.

```python
class ChatRequest(BaseModel):
    conversation_id: str
    message: str
    history: list[dict] = []
    filters: FilterParams | None = None
```

### Frontend — `hooks/useChat.ts`

Enrich `ChatMessage` to carry optional listing data:

```typescript
export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  created_at: string
  // Set on new messages only; undefined for messages loaded from history
  filters?: Filters
  listings?: Listing[]
  filtersApplied?: Record<string, unknown>
  maxPricePerBed?: number | null
}
```

`sendMessage` signature: `(content: string, filters?: Filters) => Promise<void>`

Filters are attached to both the optimistic user message and the parsed assistant response.

### Frontend — `components/chat/ChatWindow.tsx`

- Empty state: full `EmptyState` component (hero title + 4 suggested prompts), calls `onSuggest(query)` prop
- User messages: `msg.filters !== undefined` → `UserBubble`, else → `MessageBubble` (Markdown text only, for historical messages loaded from DB)
- Assistant messages: `msg.listings !== undefined` → `AssistantMessage` (full card/table/map views), else → `MessageBubble`

New props: `onSuggest: (q: string) => void`, `onSelect: (listing: Listing) => void`

### Frontend — `app/chat/page.tsx`

Add:
- `filters` state (initialized to `DEFAULT_FILTERS`)
- `selectedListing` state for `PropertyDrawer`
- `FilterPanel` between `ChatWindow` and `MessageInput`
- `PropertyDrawer` at page root
- `handleSend(msg)` wrapper that injects current filters into `sendMessage`

---

## Known Limitation: Historical Messages

Messages loaded from the database via `/api/conversations/:id/messages` are plain text — listing objects and filter snapshots are not persisted. Historical messages will render as Markdown text bubbles (`MessageBubble`), not as rich card/table/map views. This is acceptable for v1; persisting structured message data to the DB is a future improvement.

---

## Future Improvements

- Persist `listings` + `filters` alongside messages in the database so historical conversations show full card/table/map views on reload
- Animate the EmptyState → ChatWindow transition when the first message is sent
- Make the agent's `housing_search` tool also accept a `location_hint` extracted from the UI (e.g., if a user pins a landmark on the map)
