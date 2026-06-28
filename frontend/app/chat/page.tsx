"use client"

import { useChat } from "@/hooks/useChat"
import ConversationSidebar from "@/components/chat/ConversationSidebar"
import ChatWindow from "@/components/chat/ChatWindow"
import MessageInput from "@/components/chat/MessageInput"

export default function ChatPage() {
  const {
    messages,
    isLoading,
    conversations,
    activeId,
    selectConversation,
    newConversation,
    sendMessage,
  } = useChat()

  return (
    <div className="flex h-screen bg-neutral-100 overflow-hidden">
      <ConversationSidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={selectConversation}
        onNew={newConversation}
      />

      <div className="flex flex-col flex-1 min-w-0">
        <ChatWindow messages={messages} isLoading={isLoading} />
        <MessageInput onSend={sendMessage} disabled={isLoading} />
      </div>
    </div>
  )
}
