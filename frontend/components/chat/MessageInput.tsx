"use client"

import { useState, useRef, useEffect } from "react"

interface MessageInputProps {
  onSend: (message: string) => void
  disabled: boolean
  filtersOpen?: boolean
  onToggleFilters?: () => void
}

export default function MessageInput({ onSend, disabled, filtersOpen, onToggleFilters }: MessageInputProps) {
  const [value, setValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const canSend = value.trim().length > 0 && !disabled

  // Auto-resize textarea as content grows
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (canSend) submit()
    }
  }

  function submit() {
    const msg = value.trim()
    if (!msg) return
    onSend(msg)
    setValue("")
    if (textareaRef.current) textareaRef.current.style.height = "auto"
  }

  return (
    <div className="px-6 py-4 bg-neutral-100">
      <div
        className={`flex items-end gap-2 max-w-3xl mx-auto bg-white rounded-2xl p-2 transition-shadow ${
          canSend
            ? "shadow-[0_10px_34px_-10px_rgba(0,0,0,0.2)] ring-2 ring-black"
            : "shadow-[0_8px_30px_-12px_rgba(0,0,0,0.15)]"
        }`}
      >
        {onToggleFilters && (
          <button
            type="button"
            onClick={onToggleFilters}
            title={filtersOpen ? "Hide filters" : "Show filters"}
            className={`shrink-0 mb-0.5 w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
              filtersOpen
                ? "bg-black text-white"
                : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-700"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <line x1="2" y1="4" x2="14" y2="4" />
              <line x1="2" y1="8" x2="14" y2="8" />
              <line x1="2" y1="12" x2="14" y2="12" />
              <circle cx="5" cy="4" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="10" cy="8" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="6" cy="12" r="1.5" fill="currentColor" stroke="none" />
            </svg>
          </button>
        )}
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Ask about UIUC housing…"
          className="flex-1 resize-none bg-transparent px-3 py-2 text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none disabled:opacity-50 max-h-40 leading-relaxed"
        />
        <button
          onClick={submit}
          disabled={!canSend}
          className={`shrink-0 mb-0.5 w-9 h-9 rounded-xl flex items-center justify-center text-sm font-semibold transition-colors ${
            canSend
              ? "bg-black text-white"
              : "bg-neutral-100 text-neutral-400 cursor-not-allowed"
          }`}
        >
          ↑
        </button>
      </div>
      <p className="text-center text-[11px] text-neutral-400 mt-2">
        Enter to send · Shift+Enter for newline
      </p>
    </div>
  )
}
