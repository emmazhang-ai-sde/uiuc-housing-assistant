# Step 1: Static Chat UI

**Created: 2026-06-25**

← Back to [Agent Architecture](agent-architecture.md)

**Status: ✅ Complete**

---

## Goal

Build the full chat layout with hardcoded seed data and a mock backend response. No Supabase, no real FastAPI calls. Validates layout and Morandi styling before wiring real data.

---

## Files Created

| File | Purpose |
|------|---------|
| [`frontend/hooks/useChat.ts`](../frontend/hooks/useChat.ts) | Core state hook: `messages`, `isLoading`, `sendMessage`. Uses hardcoded seed messages + 1.2s mock delay to simulate a reply. No DB or backend calls. |
| [`frontend/components/chat/MessageBubble.tsx`](../frontend/components/chat/MessageBubble.tsx) | Single message bubble. User: right-aligned, `bg-neutral-900 text-white`. Assistant: left-aligned, `bg-white` with subtle shadow. Assistant content rendered via `react-markdown`. |
| [`frontend/components/chat/TypingIndicator.tsx`](../frontend/components/chat/TypingIndicator.tsx) | Animated three-dot indicator shown while `isLoading` is true. |
| [`frontend/components/chat/MessageInput.tsx`](../frontend/components/chat/MessageInput.tsx) | Bottom input: textarea expands vertically, `Enter` sends, `Shift+Enter` newline, disabled while loading. |
| [`frontend/components/chat/ChatWindow.tsx`](../frontend/components/chat/ChatWindow.tsx) | Scrollable message list. Auto-scrolls to bottom on new messages. Renders `MessageBubble` list + `TypingIndicator` when loading. |
| [`frontend/components/chat/ConversationSidebar.tsx`](../frontend/components/chat/ConversationSidebar.tsx) | Left sidebar: "+ New Chat" button, hardcoded conversation list, active item soft-highlighted. Morandi bg: `bg-stone-50`. |
| [`frontend/app/chat/page.tsx`](../frontend/app/chat/page.tsx) | `/chat` route. Assembles `ConversationSidebar` + `ChatWindow` + `MessageInput`. Manages `activeConversationId` state. Calls `useChat`. |

---

## Hardcoded Seed Data (Step 1 only)

`useChat.ts` contains three hardcoded conversations and two seed messages for the first conversation. These are replaced by real Supabase calls in Step 2.

```typescript
const SEED_CONVERSATIONS = [
  { id: "conv-1", title: "2BR apartments near Green St", ... },
  { id: "conv-2", title: "Cheapest studios for fall", ... },
  { id: "conv-3", title: "Parking options near campus", ... },
]
```

The mock `sendMessage` waits 1.2s then appends a canned reply — enough to verify the TypingIndicator and auto-scroll behavior.

---

## Deferred to Later Steps

| Item | Deferred to |
|------|------------|
| Supabase DB calls | Step 2 |
| Real FastAPI backend call | Step 3/4 |
| Streaming token rendering | Step 6 |
| Sidebar fetches from `GET /api/conversations` | Step 2 |

---

[Step 2: Database + API Routes](step-2-database-api-routes.md) →
