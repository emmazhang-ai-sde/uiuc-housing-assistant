"use client"

import { useEffect, useRef } from "react"
import MessageBubble from "./MessageBubble"
import TypingIndicator from "./TypingIndicator"
import type { ChatMessage } from "@/hooks/useChat"

interface ChatWindowProps {
  messages: ChatMessage[]
  isLoading: boolean
}

export default function ChatWindow({ messages, isLoading }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isLoading])

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
        <div className="text-4xl">🏠</div>
        <p className="text-neutral-500 text-sm max-w-xs">
          Ask anything about UIUC housing — price, location, availability, and more.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-3xl mx-auto">
        {messages.map(msg => (
          <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
        ))}
        {isLoading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
