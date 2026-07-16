"use client"

import { useEffect, useRef } from "react"
import MessageBubble from "./MessageBubble"
import TypingIndicator from "./TypingIndicator"
import AssistantMessage from "@/components/AssistantMessage"
import UserBubble from "@/components/UserBubble"
import type { ChatMessage } from "@/hooks/useChat"
import type { Listing } from "@/lib/api"

const SUGGESTED = [
  "When should I start apartment hunting?",
  "Is it too late to find a place for August?",
  "What's the average price near campus?",
  "2BR under $900/bed, what's available?",
]

interface ChatWindowProps {
  messages: ChatMessage[]
  isLoading: boolean
  onSuggest: (q: string) => void
  onSelect: (listing: Listing) => void
}

export default function ChatWindow({ messages, isLoading, onSuggest, onSelect }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isLoading])

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 overflow-y-auto px-6 pt-24 pb-6">
        <div className="flex flex-col items-center justify-center h-full gap-8 text-center">
          <div>
            <h1 className="text-5xl font-extrabold text-ink-900 tracking-tight leading-[1.3]">
              Let&rsquo;s{" "}
              <span className="bg-[linear-gradient(266deg,#ACFFE1,#CFFFC4)] rounded-xl px-2 box-decoration-clone">
                talk it through.
              </span>
            </h1>
            <p className="mx-auto text-center text-neutral-500 mt-5 text-sm max-w-md">
              This is where you figure out what you actually want. Ask general questions or specific ones.
              The conversation remembers context, so you can narrow things down turn by turn.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 max-w-2xl">
            {SUGGESTED.map(q => (
              <button
                key={q}
                onClick={() => onSuggest(q)}
                className="whitespace-nowrap px-4 py-3.5 rounded-2xl bg-white border border-mist-100 text-sm text-neutral-600 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] hover:border-mint-400 transition-colors"
              >
                &ldquo;{q}&rdquo;
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 pt-24 pb-6">
      <div className="max-w-7xl mx-auto">
        {messages.map(msg => {
          if (msg.role === "user") {
            // New in-session messages have a filters snapshot → show full UserBubble
            if (msg.filters !== undefined) {
              return <UserBubble key={msg.id} text={msg.content} filters={msg.filters} />
            }
            // Historical messages loaded from DB — plain bubble
            return <MessageBubble key={msg.id} role="user" content={msg.content} />
          }

          // Assistant: new messages have listings array → show full AssistantMessage
          if (msg.listings !== undefined) {
            return (
              <AssistantMessage
                key={msg.id}
                answer={msg.content}
                listings={msg.listings}
                maxPricePerBed={msg.maxPricePerBed ?? null}
                query={msg.content}
                filters={msg.filters ?? { beds: null, availability_window: null, max_price_per_bed: null, company: null, buffer_type: "percent", buffer_value: 15, property_type: null, penthouse: null }}
                filtersApplied={msg.filtersApplied ?? {}}
                onSelect={onSelect}
              />
            )
          }
          // Historical assistant messages — Markdown text bubble
          return <MessageBubble key={msg.id} role="assistant" content={msg.content} />
        })}
        {isLoading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
