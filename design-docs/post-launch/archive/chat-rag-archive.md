# Chat / RAG Archive

**Created: 2026-09-17**
**Updated: 2026-09-17**

## Status

The product no longer presents Chat, Table, or RAG as primary user-facing surfaces. The active search experience is now the structured listing dataset shown through Card and Map views.

Legacy code has been moved to `archive/legacy-chat-rag/` so the active app structure stays focused on data search.

## Why It Was Archived

The real user pain point is fragmented housing data: students need one reliable place to filter prices, beds, move-in windows, property types, sources, and location. The RAG/chat path added cost, latency, provider fragility, prompt maintenance, and ambiguous extraction behavior without being necessary for the core search workflow.

The stronger product story is now: scrape and normalize real landlord data, keep it current, and make it easy to compare.

## Archived User Surfaces

| Former surface | Current behavior | Archive / note |
| --- | --- | --- |
| `/chat` | Not served | Old route code is archived under `archive/legacy-chat-rag/frontend/app/chat`. |
| `/table` | Not served | Old route code is archived under `archive/legacy-chat-rag/frontend/app/table`; the fuller table implementation remains at `design-docs/post-launch/archive/table-page-v1.tsx`. |
| Chat tab | Removed from `AppHeader` | Card and Map are the primary tabs. |
| Table tab | Removed from `AppHeader` | Table is no longer a product surface. |

## Archived Code

These files are historical/legacy and should not be treated as active product direction unless the feature is intentionally revived:

- `archive/legacy-chat-rag/python/rag/` — LLM filter extraction, Chroma retrieval, proximity filtering, summary generation, and LangGraph agent.
- `archive/legacy-chat-rag/backend/main-with-rag-endpoints.py` — old FastAPI `/api/search` and `/chat` implementation.
- `archive/legacy-chat-rag/frontend/app/api/chat/` — old Next.js chat proxy.
- `archive/legacy-chat-rag/frontend/app/api/conversations/` — old chat persistence routes.
- `archive/legacy-chat-rag/frontend/hooks/useChat.ts` and `archive/legacy-chat-rag/frontend/components/chat/` — old chat UI and state.
- `archive/legacy-chat-rag/frontend/components/AssistantMessage.tsx`, `SummaryTable.tsx`, `UserBubble.tsx`, and `Sidebar.tsx` — old rich chat/table result tooling.
- `archive/legacy-chat-rag/chroma_db/` and `archive/legacy-chat-rag/models/` — old vector store and embedding model assets.

## Active Direction

Keep the main path simple:

1. Scrape source websites into `data/*_raw.json`.
2. Normalize and snapshot into `snapshots/listings_YYYY-MM-DD.db`.
3. Serve structured SQL-filtered data through `/api/listings`.
4. Let users browse through Card and Map views.

## Future Cleanup Checklist

- Drop LangChain, Groq, Ollama, Chroma, and sentence-transformer dependencies when we are sure no archived code needs to run locally.
- Remove old Supabase conversation tables if no historical chat data needs to be preserved.
