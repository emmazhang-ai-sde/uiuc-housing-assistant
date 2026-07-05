"use client"

import { useState } from "react"
import { useChat } from "@/hooks/useChat"
import AppHeader from "@/components/AppHeader"
import ConversationSidebar from "@/components/chat/ConversationSidebar"
import ChatWindow from "@/components/chat/ChatWindow"
import MessageInput from "@/components/chat/MessageInput"
import PropertyPanel from "@/components/PropertyPanel"
import { DEFAULT_FILTERS } from "@/lib/api"
import type { Listing } from "@/lib/api"

export default function ChatPage() {
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
    sendMessage(message, DEFAULT_FILTERS)
  }

  function handleSuggest(query: string) {
    sendMessage(query, DEFAULT_FILTERS)
  }

  return (
    <div className="relative h-screen bg-neutral-100 overflow-hidden">
      <div className="flex h-full overflow-hidden">
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
          <MessageInput
            onSend={handleSend}
            disabled={isLoading}
          />
        </div>

        <PropertyPanel listing={selectedListing} onClose={() => setSelectedListing(null)} />
      </div>

      {/* Floating header pill, overlaid on top like the Map/Card views */}
      <div className="absolute top-0 inset-x-0 z-30 pointer-events-none [&_header>div]:pointer-events-auto">
        <AppHeader />
      </div>
    </div>
  )
}
