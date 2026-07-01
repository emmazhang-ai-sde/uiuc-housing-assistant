"use client"

import { useState } from "react"
import { useChat } from "@/hooks/useChat"
import AppHeader from "@/components/AppHeader"
import ConversationSidebar from "@/components/chat/ConversationSidebar"
import ChatWindow from "@/components/chat/ChatWindow"
import MessageInput from "@/components/chat/MessageInput"
import FilterPanel from "@/components/FilterPanel"
import PropertyDrawer from "@/components/PropertyDrawer"
import { DEFAULT_FILTERS } from "@/lib/api"
import type { Filters, Listing } from "@/lib/api"

export default function ChatPage() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [showFilters, setShowFilters] = useState(false)
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null)

  const {
    messages,
    isLoading,
    conversations,
    activeId,
    selectConversation,
    newConversation,
    sendMessage,
  } = useChat()

  function handleSend(message: string) {
    sendMessage(message, filters)
  }

  function handleSuggest(query: string) {
    sendMessage(query, filters)
  }

  return (
    <div className="flex flex-col h-screen bg-neutral-100 overflow-hidden">
      <AppHeader />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <ConversationSidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={selectConversation}
          onNew={newConversation}
        />

        <div className="flex flex-col flex-1 min-w-0">
          <ChatWindow
            messages={messages}
            isLoading={isLoading}
            onSuggest={handleSuggest}
            onSelect={setSelectedListing}
          />
          {showFilters && (
            <FilterPanel
              filters={filters}
              onChange={setFilters}
            />
          )}
          <MessageInput
            onSend={handleSend}
            disabled={isLoading}
            filtersOpen={showFilters}
            onToggleFilters={() => setShowFilters(v => !v)}
          />
        </div>
      </div>

      <PropertyDrawer listing={selectedListing} onClose={() => setSelectedListing(null)} />
    </div>
  )
}
