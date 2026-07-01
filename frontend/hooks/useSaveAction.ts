"use client"

import { useState } from "react"

export type SaveStatus = "idle" | "saving" | "failed"

export function useSaveAction() {
  const [status, setStatus] = useState<SaveStatus>("idle")

  async function trigger(fn: () => Promise<void>) {
    setStatus("saving")
    try {
      await fn()
      setStatus("idle")
    } catch (err) {
      console.error(err)
      setStatus("failed")
      window.setTimeout(() => setStatus("idle"), 1600)
    }
  }

  return { status, trigger }
}
