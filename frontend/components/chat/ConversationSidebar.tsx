"use client"

import type { Conversation } from "@/hooks/useChat"

interface ConversationSidebarProps {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
}

export default function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
}: ConversationSidebarProps) {
  return (
    <aside className="hidden md:flex flex-col w-64 bg-stone-50 border-r border-stone-200 shrink-0 h-full">
      {/* Header */}
      <div className="p-4 border-b border-stone-200">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">🏠</span>
          <span className="font-semibold text-neutral-800 text-sm leading-tight">
            UIUC Housing<br />
            <span className="font-normal text-neutral-400 text-[11px] uppercase tracking-widest">
              Assistant
            </span>
          </span>
        </div>
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white border border-stone-200 text-sm text-neutral-700 font-medium hover:bg-stone-100 transition-colors"
        >
          <span className="text-base leading-none">+</span>
          New Chat
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto py-2">
        {conversations.length === 0 ? (
          <p className="text-xs text-neutral-400 text-center mt-6 px-4">
            No conversations yet
          </p>
        ) : (
          <ul className="space-y-0.5 px-2">
            {conversations.map(conv => (
              <li key={conv.id}>
                <button
                  onClick={() => onSelect(conv.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm leading-snug transition-colors ${
                    conv.id === activeId
                      ? "bg-stone-200 text-neutral-900 font-medium"
                      : "text-neutral-600 hover:bg-stone-100"
                  }`}
                >
                  <span className="line-clamp-2">{conv.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-stone-200">
        <p className="text-[11px] text-center" style={{ color: "#7B90A0" }}>
          Champaign-Urbana, IL
        </p>
      </div>
    </aside>
  )
}
