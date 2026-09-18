import Markdown from "react-markdown"
import type { ChatMessage } from "@/hooks/useChat"

export default function MessageBubble({ role, content }: Pick<ChatMessage, "role" | "content">) {
  if (role === "user") {
    return (
      <div className="flex justify-end items-end gap-3 mb-4">
        <div className="max-w-[72%] bg-[linear-gradient(266deg,#ACFFE1,#CFFFC4)] text-ink-900 rounded-3xl rounded-tr-lg px-5 py-3.5 text-[15px] font-medium leading-relaxed">
          {content}
        </div>
        <div className="w-8 h-8 bg-mint-200 rounded-full flex items-center justify-center shrink-0 text-sm">
          🌽
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-8 h-8 bg-white border border-mist-100 rounded-full flex items-center justify-center shrink-0 text-sm mt-1">
        🏠
      </div>
      <div className="max-w-[80%] bg-white border border-mist-100 rounded-3xl rounded-tl-lg px-5 py-4 text-[15px] text-ink-900 leading-relaxed">
        <Markdown
          components={{
            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
            ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 mb-2">{children}</ol>,
            ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 mb-2">{children}</ul>,
            li: ({ children }) => <li>{children}</li>,
            strong: ({ children }) => <strong className="font-semibold text-neutral-900">{children}</strong>,
            code: ({ children }) => (
              <code className="bg-mist-100 px-1.5 py-0.5 rounded text-sm font-mono text-neutral-700">
                {children}
              </code>
            ),
          }}
        >
          {content}
        </Markdown>
      </div>
    </div>
  )
}
