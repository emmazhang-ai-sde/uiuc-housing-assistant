"use client"

import { useState, useRef, useEffect } from "react"
import Sidebar from "@/components/Sidebar"
import UserBubble from "@/components/UserBubble"
import AssistantMessage from "@/components/AssistantMessage"
import FilterPanel from "@/components/FilterPanel"
import { search, Listing, Filters, DEFAULT_FILTERS } from "@/lib/api"
import { createClient } from "@/lib/supabase/client"
import PropertyDrawer from "@/components/PropertyDrawer"

type Message =
  | { role: "user"; text: string; filters: Filters }
  | { role: "assistant"; answer: string; listings: Listing[]; maxPricePerBed: number | null; query: string; filters: Filters }

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
  const [composerActive, setComposerActive] = useState(false)
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputReady = input.trim().length > 0
  const composerHighlighted = composerActive || inputReady

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  async function submit(query: string) {
    if (!query.trim() || loading) return
    const q = query.trim()
    const filtersSnapshot = { ...filters, beds: filters.beds ? [...filters.beds] : null }
    const maxPricePerBed = filters.max_price_per_bed  // capture at submit time for badge
    setInput("")
    setComposerActive(false)
    setMessages(prev => [...prev, { role: "user", text: q, filters: filtersSnapshot }])
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await search(q, filtersSnapshot, session?.access_token)
      setMessages(prev => [
        ...prev,
        { role: "assistant", answer: res.answer, listings: res.listings, maxPricePerBed, query: q, filters: filtersSnapshot },
      ])
    } catch {
      setMessages(prev => [
        ...prev,
        { role: "assistant", answer: "Something went wrong — is the backend running on port 8000?", listings: [], maxPricePerBed: null, query: q, filters: filtersSnapshot },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen bg-neutral-100 overflow-hidden">
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
                  ? <UserBubble key={i} text={m.text} filters={m.filters} />
                  : <AssistantMessage
                      key={i}
                      answer={m.answer}
                      listings={m.listings}
                      maxPricePerBed={m.maxPricePerBed}
                      query={m.query}
                      filters={m.filters}
                      onSelect={setSelectedListing}
                    />
              )}
              {loading && <ThinkingBubble />}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Filter panel — Phase 6 */}
        <FilterPanel
          filters={filters}
          onChange={setFilters}
          onInteract={() => setComposerActive(true)}
        />

        {/* Input bar */}
        <div className="bg-neutral-100 px-6 py-4">
          <form
            onSubmit={e => { e.preventDefault(); submit(input) }}
            className={`flex gap-2 max-w-5xl mx-auto bg-white rounded-full p-1.5 transition-shadow ${
              composerHighlighted
                ? "shadow-[0_10px_34px_-10px_rgba(0,0,0,0.2)] ring-2 ring-black"
                : "shadow-[0_8px_30px_-12px_rgba(0,0,0,0.15)]"
            }`}
          >
            <input
              value={input}
              onFocus={() => setComposerActive(true)}
              onChange={e => {
                setComposerActive(true)
                setInput(e.target.value)
              }}
              placeholder='e.g. "2BR under $900/month near Grainger"'
              disabled={loading}
              className="flex-1 rounded-full px-5 py-2.5 text-sm text-neutral-800 placeholder-neutral-400 bg-transparent focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!inputReady || loading}
              className={`px-5 py-2.5 rounded-full border text-sm font-semibold transition-colors ${
                composerHighlighted
                  ? "bg-black text-white border-black"
                  : "bg-neutral-100 text-neutral-900 border-neutral-100 hover:bg-black hover:text-white hover:border-black"
              } ${inputReady && !loading ? "" : "cursor-not-allowed"}`}
            >
              Send
            </button>
          </form>
        </div>

      </div>
      <PropertyDrawer listing={selectedListing} onClose={() => setSelectedListing(null)} />
    </div>
  )
}

function EmptyState({ onSuggest }: { onSuggest: (q: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 text-center">
      <div>
        <h1 className="text-5xl font-bold text-neutral-900 leading-[1.3]">
          Find Your Dream Homes Near UIUC, <br />Within Budget
        </h1>
        <p className="mx-auto text-center text-neutral-500 mt-5 text-sm max-w-md">
          Search 879 floor plans across 410 properties from Green Street Realty + Universities Group (more rental companies are coming!) by price, beds, location, availability and so on.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
        {SUGGESTED.map(q => (
          <button
            key={q}
            onClick={() => onSuggest(q)}
            className="text-left px-4 py-3.5 rounded-2xl bg-white text-sm text-neutral-600 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_24px_-6px_rgba(0,0,0,0.12)] transition-shadow leading-snug"
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
      <div className="w-8 h-8 bg-neutral-200 rounded-full flex items-center justify-center shrink-0 text-sm mt-1">
        🏠
      </div>
      <div className="bg-white rounded-3xl rounded-tl-lg px-5 py-4 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] text-neutral-400 text-sm italic">
        Searching listings…
      </div>
    </div>
  )
}
