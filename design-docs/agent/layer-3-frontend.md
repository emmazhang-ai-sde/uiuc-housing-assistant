# Layer 3: Frontend — Chat UI in Next.js

**Created: 2026-06-25**

← Back to [Agent Architecture](agent-architecture.md)

---

## Goal

Replace or augment the existing UI with a ChatGPT-style chat interface: a sidebar listing past conversations and a main panel showing the message thread with a text input at the bottom.

---

## Layout

```
┌───────────────────┬────────────────────────────────────────────┐
│  Sidebar          │  Chat Window                               │
│                   │                                            │
│  [+ New Chat]     │                                            │
│  ─────────────    │   ╭─────────────────────────╮             │
│  · Campustown     │   │ Which apartments near    │  (user)     │
│    apartments     │   │ Green St have parking?   │             │
│  · Green St       │   ╰─────────────────────────╯             │
│    parking        │                                            │
│  · Lease terms    │   ╭──────────────────────────────────╮    │
│    question       │   │ Here are a few options...        │    │
│                   │   │                                  │    │
│                   │   │ 1. Lincoln Avenue Apts — ...     │  ← assistant
│                   │   │ 2. Green Street Realty — ...     │    │
│                   │   ╰──────────────────────────────────╯    │
│                   │                                            │
│                   │   ╭─────────────────────────╮             │
│                   │   │ What's nearby for food? │  (user)     │
│                   │   ╰─────────────────────────╯             │
│                   │                                            │
│                   │   ┌────────────────────────────────────┐  │
│                   │   │  Ask about UIUC housing...     [→] │  │
│                   │   └────────────────────────────────────┘  │
└───────────────────┴────────────────────────────────────────────┘
```

---

## Component Tree

```
app/
└── chat/
    └── page.tsx                  ← route: /chat
        ├── ConversationSidebar   ← lists past chats, "New Chat" button
        ├── ChatWindow            ← scrollable message bubble list
        │   ├── MessageBubble     ← single message (user or assistant)
        │   └── TypingIndicator   ← shown while assistant is responding
        └── MessageInput          ← textarea + send button
```

---

## Component Details

### `ConversationSidebar`

- On mount: fetches `GET /api/conversations` and renders a list of past chats sorted by `updated_at` desc.
- Each item shows the auto-generated title (or "New conversation" if no title yet).
- Clicking an item loads that conversation's messages into `ChatWindow`.
- "New Chat" button creates a new conversation via `POST /api/conversations` and clears `ChatWindow`.

```typescript
// Props
interface ConversationSidebarProps {
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
}
```

---

### `ChatWindow`

- Fetches `GET /api/conversations/[id]/messages` when `conversationId` changes.
- Renders messages in order, user messages right-aligned, assistant messages left-aligned.
- Auto-scrolls to the bottom on new messages.
- Shows `TypingIndicator` while `isLoading` is true.

```typescript
interface ChatWindowProps {
  conversationId: string | null
  messages: Message[]
  isLoading: boolean
}
```

---

### `MessageBubble`

```typescript
interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}
```

Render assistant content as Markdown (using `react-markdown`) so formatted lists, bold text, and code blocks display correctly.

---

### `MessageInput`

- Textarea that expands vertically as the user types.
- `Enter` sends the message; `Shift+Enter` adds a newline.
- Disabled while `isLoading` is true to prevent double-sending.

```typescript
interface MessageInputProps {
  onSend: (message: string) => void
  disabled: boolean
}
```

---

## `useChat` Hook

Central logic hook that owns all state and orchestrates DB writes and backend calls.

```typescript
// hooks/useChat.ts

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

function useChat(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Load history when conversation changes
  useEffect(() => {
    if (!conversationId) return
    fetch(`/api/conversations/${conversationId}/messages`)
      .then(r => r.json())
      .then(setMessages)
  }, [conversationId])

  const sendMessage = async (content: string) => {
    if (!conversationId || isLoading) return

    // 1. Optimistically add user message to UI
    const userMsg = { id: crypto.randomUUID(), role: 'user', content, created_at: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)

    // 2. Persist user message to DB
    await fetch(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ role: 'user', content }),
    })

    // 3. Call the agent backend (pass full history for stateless memory)
    const res = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        conversation_id: conversationId,
        message: content,
        history: messages.concat(userMsg).map(m => ({ role: m.role, content: m.content })),
      }),
    })
    const { answer } = await res.json()

    // 4. Add assistant response to UI
    const assistantMsg = { id: crypto.randomUUID(), role: 'assistant', content: answer, created_at: new Date().toISOString() }
    setMessages(prev => [...prev, assistantMsg])

    // 5. Persist assistant message to DB
    await fetch(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ role: 'assistant', content: answer }),
    })

    setIsLoading(false)
  }

  return { messages, isLoading, sendMessage }
}
```

---

## Streaming UI (If Streaming is Enabled in Backend)

If the backend returns a streaming response (Server-Sent Events), update the hook to stream tokens into the last assistant bubble in real time:

```typescript
// Replace step 3–4 above with:
const response = await fetch('/api/chat/stream', { method: 'POST', body: ... })
const reader = response.body!.getReader()
const decoder = new TextDecoder()

let assistantContent = ''
setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: '', created_at: new Date().toISOString() }])

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data:'))
  for (const line of lines) {
    const json = line.replace('data: ', '')
    if (json === '[DONE]') break
    const { token } = JSON.parse(json)
    assistantContent += token
    // Update last message in place
    setMessages(prev => [
      ...prev.slice(0, -1),
      { ...prev[prev.length - 1], content: assistantContent }
    ])
  }
}
```

---

## Styling Notes

Following the Morandi color palette used in the rest of the project:

- User message bubbles: muted warm tone (e.g., `bg-stone-100`)
- Assistant message bubbles: light neutral (e.g., `bg-slate-50` with subtle border)
- Sidebar background: slightly darker neutral (e.g., `bg-stone-50`)
- Active conversation in sidebar: soft highlight, not a vivid accent

Avoid bright Tailwind accent colors (`blue-500`, `green-500`, etc.).

---

## Dependencies to Add

```bash
npm install @supabase/supabase-js react-markdown
```

`react-markdown` renders the assistant's formatted responses (lists, bold, etc.) correctly inside the message bubbles.

---

## Implementation Steps

| Step | What gets built | Doc |
|------|-----------------|-----|
| Step 1 ✅ | Static chat UI with hardcoded messages | [step-1-static-chat-ui.md](step-1-static-chat-ui.md) |
| Step 2 🔜 | Wire Supabase DB + API routes into `useChat` | [step-2-database-api-routes.md](step-2-database-api-routes.md) |
| Step 6 🔜 | Streaming token-by-token response rendering | [step-6-streaming.md](step-6-streaming.md) |
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json([], { status: 401 })

  const { data } = await supabase
    .from("conversations")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false })

  return NextResponse.json(data ?? [])
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data } = await supabase
    .from("conversations")
    .insert({ user_id: user.id, title: "New conversation" })
    .select("id")
    .single()

  return NextResponse.json(data)
}