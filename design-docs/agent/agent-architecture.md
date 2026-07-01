# Agent Architecture — UIUC Housing Assistant

**Created: 2026-06-25**

---

## Overview

Transform the current single-turn RAG pipeline into a ChatGPT-like conversational agent with persistent chat history, multi-turn context, and tool-calling capabilities.

---

## Current State vs Target State

| | Current (RAG Pipeline) | Target (Conversational Agent) |
|---|---|---|
| Turn style | Single-turn (ask → retrieve → answer) | Multi-turn with conversation memory |
| UI | Streamlit / basic form | ChatGPT-style chat UI in Next.js |
| History | Lost on page refresh | Persisted in Supabase |
| Tools | Vector search only | Vector search + Google Maps + extensible |
| User prefs | None | Extracted from conversation, session-scoped (not stored) |

---

## Architecture Diagram

```
┌─────────────────────────── Agent (LangGraph) ──────────────────────────────┐
│  LLM (Groq / Ollama)                                                        │
│  - Understands natural-language intent                                      │
│  - Maintains multi-turn conversation memory                                 │
│  - Decides when and with what query to call housing_search                  │
│                                                                              │
│   ┌──────────────── housing_search tool ────────────────┐                   │
│   │  Input:  NL query + explicit UI FilterPanel filters  │                   │
│   │  Action: Chroma vector search → returns listings[]   │                   │
│   │  Output: { listings: Listing[], summary_text }       │                   │
│   └──────────────────────────────────────────────────────┘                   │
│                                                                              │
│  Agent receives listings[] artifact → writes final answer text               │
└──────────────────────────────────────────────────────────────────────────────┘
          ↓
   { answer: string, listings: Listing[] }
          ↓
   Frontend: AssistantMessage
     ├── answer bubble  (text written by the Agent LLM)
     ├── Card View  ┐
     ├── Table View ├── three display modes for the same listings[] array
     └── Map View   ┘

FilterPanel → UI filters → injected into housing_search via contextvars → Chroma where clause
```

**Responsibility split:**
- **Agent** — talks and remembers (LLM layer)
- **housing_search tool** — queries data (retrieval layer)
- **FilterPanel** — adds hard constraints to the tool query
- **Card / Table / Map views** — three rendering modes for the same `listings[]`; the data is identical across all three

---

## Three Layers

### [Layer 1: Database — Conversation Persistence](layer-1-database.md)

Supabase (PostgreSQL) stores conversation threads and messages. Covers:
- Schema (`conversations` + `messages` tables with indexes and RLS)
- Next.js API routes for CRUD operations
- Auto-title generation from first message
- Anonymous session identity (no auth required)

→ [Read Layer 1 details](layer-1-database.md)

---

### [Layer 2: Backend — RAG to LangChain Agent](layer-2-backend.md)

Upgrades the existing LangChain RAG chain to a full `AgentExecutor` with memory and multiple tools. Covers:
- `ConversationBufferMemory` setup and stateless pattern
- `housing_search` tool (wraps existing ChromaDB retriever)
- `nearby_places` tool (Google Maps Places API)
- `AgentExecutor` + system prompt configuration
- FastAPI endpoint design
- Streaming response (SSE) implementation
- Upgrade path from current RAG (no data migration needed)

→ [Read Layer 2 details](layer-2-backend.md)

---

### [Layer 3: Frontend — Chat UI in Next.js](layer-3-frontend.md)

New chat interface added to the existing Next.js frontend. Covers:
- Layout: sidebar (conversation list) + main chat window
- Component tree: `ConversationSidebar`, `ChatWindow`, `MessageBubble`, `MessageInput`
- `useChat` hook: state management, DB writes, backend calls
- Streaming token-by-token rendering
- Morandi color palette guidelines for chat UI

→ [Read Layer 3 details](layer-3-frontend.md)

---

## Implementation Order

| Step | Layer | What gets built | Status | Doc |
|------|-------|-----------------|--------|-----|
| 1 | Layer 3: Frontend | Static chat UI with hardcoded messages | ✅ Complete | [step-1-static-chat-ui.md](step-1-static-chat-ui.md) |
| 2 | Layer 1: Database | Supabase table setup, Next.js API routes, wire sidebar + history into `useChat` | ✅ Complete | [step-2-database-api-routes.md](step-2-database-api-routes.md) |
| 3 | Layer 2: Backend | LangGraph agent + `housing_search` tool + `/chat` endpoint | ✅ Complete | [step-3-conversation-memory.md](step-3-conversation-memory.md) |
| 4 | Layer 3: Frontend | Unified chat UI — EmptyState, FilterPanel, card/table/map views in `/chat` | ✅ Complete | [unified-chat-ui.md](unified-chat-ui.md) |
| 5 | Layer 2: Backend | FilterPanel → `ui_filters` contextvars → `housing_search` where clause | ✅ Complete | [unified-chat-ui.md](unified-chat-ui.md) |
| 6 | Layer 3: Frontend | Streaming token-by-token response rendering | 🔜 Not started | [step-6-streaming.md](step-6-streaming.md) |

---

## User Preference Memory — Design Decision

Preferences are **not persisted to the database**. Within a session, the agent naturally picks up preferences stated by the user (e.g., "I need 2BR under $1500") because they live in `ConversationBufferMemory`. When the user starts a new conversation, they start fresh.

**Why:** Housing preferences change between searches. Storing them cross-session risks the agent making stale assumptions ("you always want 2BR") when the user's situation has changed.

---

## Open Questions

- **Auth:** User accounts vs. anonymous session ID in localStorage?
- **Streaming:** Token-by-token (better UX, more complex) vs. wait-for-full-response (simpler)?
- **Maps display:** Show nearby places results inline in chat, or pin them on the existing embedded map?

---

## Environment Variables Summary

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Backend
GOOGLE_MAPS_API_KEY=
OPENAI_API_KEY=
```
