"use client"

import type { SaveStatus } from "@/hooks/useSaveAction"

type Props = {
  status: SaveStatus
  onClick: () => void
  label: string
  savingLabel?: string
  disabled?: boolean
  className?: string
  title?: string
}

export default function SaveButton({
  status,
  onClick,
  label,
  savingLabel = "Saving…",
  disabled,
  className,
  title,
}: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || status === "saving"}
      title={title}
      className={`rounded-full bg-forest-green px-3 py-1 text-sm font-semibold text-warm-ivory transition-colors hover:bg-ink-900 disabled:cursor-not-allowed disabled:opacity-50 ${className ?? ""}`}
    >
      {status === "saving" ? savingLabel : status === "failed" ? "Save failed" : label}
    </button>
  )
}
