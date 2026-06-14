"use client"

import { useState, useRef, useEffect } from "react"
import Sidebar from "@/components/Sidebar"
import UserBubble from "@/components/UserBubble"
import AssistantMessage from "@/components/AssistantMessage"
import FilterPanel from "@/components/FilterPanel"
import { search, Listing, Filters, DEFAULT_FILTERS } from "@/lib/api"

type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; answer: string; listings: Listing[]; maxPricePerBed: number | null }

const SUGGESTED = [
  "2BR under $900/bed — what's available?",
  "Cheapest 1 bedroom near campus",
  "4BR options and total monthly cost?",
  "Units available for August 2026",
]

export default function Home() {
  const [messages, setMessages]   = useState<Message[]>([])
  const [input, setInput]         = useState("")
  const [loading, setLoading]     = useState(false)
  const [filters, setFilters]     = useState<Filters>(DEFAULT_FILTERS)  // Phase 6
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  async function submit(query: string) {
    if (!query.trim() || loading) return
    const q = query.trim()
    const maxPricePerBed = filters.max_price_per_bed  // capture at submit time for badge
    setInput("")
    setMessages(prev => [...prev, { role: "user", text: q }])
    setLoading(true)
    try {
      const res = await search(q, filters)
      setMessages(prev => [
        ...prev,
        { role: "assistant", answer: res.answer, listings: res.listings, maxPricePerBed },
      ])
    } catch {
      setMessages(prev => [
        ...prev,
        { role: "assistant", answer: "Something went wrong — is the backend running on port 8000?", listings: [], maxPricePerBed: null },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      <Sidebar onClear={() => setMessages([])} />

      <div className="flex flex-col flex-1 min-w-0">

        {/* Chat thread */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-6">
          {messages.length === 0 ? (
            <EmptyState onSuggest={submit} />
          ) : (
            <div className="max-w-7xl mx-auto">
              {messages.map((m, i) =>
                m.role === "user"
                  ? <UserBubble key={i} text={m.text} />
                  : <AssistantMessage
                      key={i}
                      answer={m.answer}
                      listings={m.listings}
                      maxPricePerBed={m.maxPricePerBed}
                    />
              )}
              {loading && <ThinkingBubble />}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Filter panel — Phase 6 */}
        <FilterPanel filters={filters} onChange={setFilters} />

        {/* Input bar */}
        <div className="border-t border-slate-200 bg-white px-6 py-4">
          <form
            onSubmit={e => { e.preventDefault(); submit(input) }}
            className="flex gap-3 max-w-5xl mx-auto"
          >
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder='e.g. "2BR under $900/month near Grainger"'
              disabled={loading}
              className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="px-5 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </form>
        </div>

      </div>
    </div>
  )
}

function EmptyState({ onSuggest }: { onSuggest: (q: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 text-center">
      <div>
        <div className="text-5xl mb-4">🏠</div>
        <h1 className="text-2xl font-bold text-slate-900">UIUC Housing Assistant</h1>
        <p className="text-slate-500 mt-2 text-sm max-w-sm">
          Search 489 Green Street Realty listings by price, beds, location, or availability.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
        {SUGGESTED.map(q => (
          <button
            key={q}
            onClick={() => onSuggest(q)}
            className="text-left px-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-700 hover:border-blue-400 hover:bg-blue-50 transition-colors leading-snug"
          >
            &ldquo;{q}&rdquo;
          </button>
        ))}
      </div>
    </div>
  )
}

function ThinkingBubble() {
  return (
    <div className="flex items-start gap-3 my-4">
      <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center shrink-0 text-sm mt-1">
        🏠
      </div>
      <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm text-slate-400 text-sm italic">
        Searching listings…
      </div>
    </div>
  )
}
