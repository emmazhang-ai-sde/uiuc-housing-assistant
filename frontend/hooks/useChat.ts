"use client"

import { useState, useCallback, useEffect } from "react"
import type { Listing, Filters } from "@/lib/api"

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  created_at: string
  // Populated on new in-session messages only; undefined for messages loaded from DB history
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

  // On mount: load conversation list; auto-select the most recent one
  useEffect(() => {
    fetch("/api/conversations")
      .then(r => r.json())
      .then((data: Conversation[]) => {
        setConversations(data)
        if (data.length > 0) setActiveId(data[0].id)
      })
      .catch(() => {})
  }, [])

  const selectConversation = useCallback(async (id: string) => {
    setActiveId(id)
    if (messagesByConv[id]) return  // already loaded
    const data: ChatMessage[] = await fetch(`/api/conversations/${id}/messages`).then(r => r.json())
    setMessagesByConv(prev => ({ ...prev, [id]: data }))
  }, [messagesByConv])

  const newConversation = useCallback(async () => {
    const data = await fetch("/api/conversations", { method: "POST" }).then(r => r.json())
    if (!data?.id) return
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
      if (!created?.id) return
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

      // Persist user message
      await fetch(`/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content }),
      })

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

      await fetch(`/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "assistant", content: answer }),
      })
    } catch (err) {
      console.error("sendMessage failed:", err)
    } finally {
      setLoadingByConv(prev => ({ ...prev, [convId!]: false }))
    }
  }, [activeId, messagesByConv, loadingByConv])

  return { messages, isLoading, conversations, activeId, selectConversation, newConversation, sendMessage }
}
