"use client"

import { useState, useCallback, useEffect } from "react"

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  created_at: string
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
  const [isLoading, setIsLoading] = useState(false)

  const messages: ChatMessage[] = activeId ? (messagesByConv[activeId] ?? []) : []

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
    const { id } = await fetch("/api/conversations", { method: "POST" }).then(r => r.json())
    const conv: Conversation = { id, title: "New conversation", updated_at: new Date().toISOString() }
    setConversations(prev => [conv, ...prev])
    setActiveId(id)
    setMessagesByConv(prev => ({ ...prev, [id]: [] }))
  }, [])

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading || !activeId) return
    setIsLoading(true)

    // [Step 3] Capture history before optimistic update — backend receives prior context only
    const history = (messagesByConv[activeId] ?? []).map(m => ({
      role: m.role,
      content: m.content,
    }))

    // Optimistic UI
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      created_at: new Date().toISOString(),
    }
    setMessagesByConv(prev => ({ ...prev, [activeId]: [...(prev[activeId] ?? []), userMsg] }))

    // Persist user message
    await fetch(`/api/conversations/${activeId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "user", content }),
    })

    // [Step 3] Real backend call — replaces mock delay
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: activeId, message: content, history }),
    })
    const { answer } = await res.json()

    // Show + persist assistant message
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: answer,
      created_at: new Date().toISOString(),
    }
    setMessagesByConv(prev => ({ ...prev, [activeId]: [...(prev[activeId] ?? []), assistantMsg] }))
    await fetch(`/api/conversations/${activeId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "assistant", content: answer }),
    })

    setIsLoading(false)
  }, [isLoading, activeId, messagesByConv])

  return { messages, isLoading, conversations, activeId, selectConversation, newConversation, sendMessage }
}
