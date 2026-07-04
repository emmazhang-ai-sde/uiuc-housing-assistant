"use client"

// [Step 2] Conversation/message persistence via the Supabase-backed API routes
// below, replacing Step 1's SEED_CONVERSATIONS/SEED_MESSAGES. The /api/chat
// call inside sendMessage (real backend, replacing the Step 2 mock reply) was
// wired in Step 3/4.
import { useState, useCallback, useEffect } from "react"
import type { Listing, Filters } from "@/lib/api"

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  created_at: string
  // Persisted into the messages.metadata jsonb column and rehydrated when a
  // conversation's history is loaded, so filters + search results survive a refresh.
  filters?: Filters
  listings?: Listing[]
  filtersApplied?: Record<string, unknown>
  maxPricePerBed?: number | null
}

export interface Conversation {
  id: string
  title: string
  updated_at: string
}

// Fetch a conversation's messages and rehydrate the filters + listings + search
// results saved in the jsonb metadata column, so a reopened conversation shows
// the card grid, not just the text. Shared by the on-mount auto-load and by
// selectConversation.
async function fetchMessages(id: string): Promise<ChatMessage[]> {
  const raw = await fetch(`/api/conversations/${id}/messages`).then(r => r.json()).catch(() => [])
  const rows: Array<{
    id: string; role: "user" | "assistant"; content: string
    created_at: string; metadata?: Record<string, unknown> | null
  }> = Array.isArray(raw) ? raw : []
  return rows.map(m => ({
    id: m.id,
    role: m.role,
    content: m.content,
    created_at: m.created_at,
    ...((m.metadata as Partial<ChatMessage>) ?? {}),
  }))
}


export function useChat() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messagesByConv, setMessagesByConv] = useState<Record<string, ChatMessage[]>>({})
  // Keyed by conversation ID — not a single global flag — so waiting on a
  // response in one conversation doesn't disable the input or show a phantom
  // typing indicator in another conversation the user switches/creates.
  const [loadingByConv, setLoadingByConv] = useState<Record<string, boolean>>({})

  const messages: ChatMessage[] = activeId ? (messagesByConv[activeId] ?? []) : []
  const isLoading = activeId ? !!loadingByConv[activeId] : false

  // On mount: load the conversation list, auto-select the most recent one, AND
  // load its messages. Setting activeId alone does not fetch history, which is
  // why a refresh showed an empty chat even though the DB had the messages.
  useEffect(() => {
    fetch("/api/conversations")
      .then(r => r.json())
      .then(async (data: Conversation[]) => {
        const list = Array.isArray(data) ? data : []
        setConversations(list)
        if (list.length > 0) {
          const first = list[0].id
          setActiveId(first)
          const msgs = await fetchMessages(first)
          setMessagesByConv(prev => ({ ...prev, [first]: msgs }))
        }
      })
      .catch(() => {})
  }, [])

  const selectConversation = useCallback(async (id: string) => {
    setActiveId(id)
    if (messagesByConv[id]) return  // already loaded
    const msgs = await fetchMessages(id)
    setMessagesByConv(prev => ({ ...prev, [id]: msgs }))
  }, [messagesByConv])

  const newConversation = useCallback(async () => {
    const data = await fetch("/api/conversations", { method: "POST" }).then(r => r.json())
    if (!data?.id) {
      console.error("Failed to create conversation:", data)
      return
    }
    const conv: Conversation = { id: data.id, title: "New conversation", updated_at: new Date().toISOString() }
    setConversations(prev => [conv, ...prev])
    setActiveId(data.id)
    setMessagesByConv(prev => ({ ...prev, [data.id]: [] }))
  }, [])

  const sendMessage = useCallback(async (content: string, filters?: Filters) => {
    if (!content.trim()) return
    if (activeId && loadingByConv[activeId]) return

    // Auto-create a conversation if none is active (first message, or fresh load)
    let convId = activeId
    if (!convId) {
      const created = await fetch("/api/conversations", { method: "POST" }).then(r => r.json())
      if (!created?.id) {
        console.error("Failed to create conversation:", created)
        return
      }
      convId = created.id as string
      const conv: Conversation = { id: convId, title: "New conversation", updated_at: new Date().toISOString() }
      setConversations(prev => [conv, ...prev])
      setActiveId(convId)
      setMessagesByConv(prev => ({ ...prev, [convId!]: [] }))
    }

    setLoadingByConv(prev => ({ ...prev, [convId!]: true }))

    try {
      // Capture history before optimistic update — backend receives prior context only
      const history = (messagesByConv[convId] ?? []).map(m => ({
        role: m.role,
        content: m.content,
      }))

      // Optimistic UI — attach filters snapshot so UserBubble can render it
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        created_at: new Date().toISOString(),
        filters,
      }
      setMessagesByConv(prev => ({ ...prev, [convId!]: [...(prev[convId!] ?? []), userMsg] }))

      // Persist user message (+ the filters snapshot in metadata)
      const persistUser = await fetch(`/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content, metadata: filters ? { filters } : null }),
      })
      if (!persistUser.ok) console.error("Failed to persist user message:", persistUser.status, await persistUser.json().catch(() => null))

      // Backend call — includes filters so the agent's housing_search tool uses them
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: convId, message: content, history, filters }),
      })
      let data: { answer?: string; listings?: Listing[]; filters_applied?: Record<string, unknown>; error?: string } = {}
      try {
        data = await res.json()
      } catch {
        data = { answer: "Sorry, something went wrong. Please try again." }
      }
      const answer = data.answer ?? data.error ?? "Sorry, something went wrong."

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: answer,
        created_at: new Date().toISOString(),
        listings: data.listings ?? [],
        filtersApplied: data.filters_applied ?? {},
        filters,
        maxPricePerBed: filters?.max_price_per_bed ?? null,
      }
      setMessagesByConv(prev => ({ ...prev, [convId!]: [...(prev[convId!] ?? []), assistantMsg] }))

      // Persist assistant message (+ listings / applied filters / search results in metadata)
      const persistAssistant = await fetch(`/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "assistant",
          content: answer,
          metadata: {
            listings: data.listings ?? [],
            filtersApplied: data.filters_applied ?? {},
            filters: filters ?? null,
            maxPricePerBed: filters?.max_price_per_bed ?? null,
          },
        }),
      })
      if (!persistAssistant.ok) console.error("Failed to persist assistant message:", persistAssistant.status, await persistAssistant.json().catch(() => null))
    } catch (err) {
      console.error("sendMessage failed:", err)
    } finally {
      setLoadingByConv(prev => ({ ...prev, [convId!]: false }))
    }
  }, [activeId, messagesByConv, loadingByConv])

  return { messages, isLoading, conversations, activeId, selectConversation, newConversation, sendMessage }
}
