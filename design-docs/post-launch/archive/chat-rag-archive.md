# Chat / RAG Archive

**Created: 2026-09-17**

## Status

The product no longer presents Chat, Table, or RAG as primary user-facing surfaces. The active search experience is now the structured listing dataset shown through Card and Map views.

This archive note preserves the old architecture so the repo stays understandable without keeping the current product narrative tied to AI/RAG.

## Why It Was Archived

The real user pain point is fragmented housing data: students need one reliable place to filter prices, beds, move-in windows, property types, sources, and location. The RAG/chat path added cost, latency, provider fragility, prompt maintenance, and ambiguous extraction behavior without being necessary for the core search workflow.

The stronger product story is now: scrape and normalize real landlord data, keep it current, and make it easy to compare.

## Archived User Surfaces

| Former surface | Current behavior | Archive / note |
| --- | --- | --- |
| `/chat` | Redirects to `/card` | Former implementation remains in git history and legacy component files. |
| `/table` | Redirects to `/card` | Previous page source is archived at `design-docs/post-launch/archive/table-page-v1.tsx`. |
| Chat tab | Removed from `AppHeader` | Card and Map are the primary tabs. |
| Table tab | Removed from `AppHeader` | Table is no longer a product surface. |

## Legacy Code Left In Place For Now

These files are historical/legacy and should not be treated as active product direction unless the feature is intentionally revived:

- `rag/rag_chain.py` — LLM filter extraction, Chroma retrieval, proximity filtering, and summary generation.
- `rag/agent.py` — LangGraph tool-calling agent for the old Chat flow.
- `backend/main.py` `/api/search` and `/chat` — old RAG and conversational endpoints.
- `frontend/app/api/chat/route.ts` — Next.js proxy for the old FastAPI chat endpoint.
- `frontend/hooks/useChat.ts` and `frontend/components/chat/*` — old chat persistence and UI.
- `frontend/components/AssistantMessage.tsx`, `frontend/components/SummaryTable.tsx`, and related export helpers — old rich search-result message/table tooling.

They are intentionally not deleted in this pass because removing them cleanly also means trimming Python dependencies, frontend components, Supabase conversation tables, old analytics event names, and a large amount of historical documentation. That should be a separate cleanup commit.

## Active Direction

Keep the main path simple:

1. Scrape source websites into `data/*_raw.json`.
2. Normalize and snapshot into `snapshots/listings_YYYY-MM-DD.db`.
3. Serve structured SQL-filtered data through `/api/listings`.
4. Let users browse through Card and Map views.

## Future Cleanup Checklist

- Remove or isolate `rag/` if no backend endpoint imports it.
- Remove `/api/search` and `/chat` from `backend/main.py` once no clients call them.
- Remove `frontend/app/api/chat`, `useChat`, and `components/chat`.
- Decide whether `SummaryTable` should live only as archived code or be deleted entirely.
- Update README and old launch docs so the top-level project description no longer sells AI/RAG as the current product.
- Consider dropping LangChain, Groq, Ollama, Chroma, and sentence-transformer dependencies if the vector index is no longer needed.
