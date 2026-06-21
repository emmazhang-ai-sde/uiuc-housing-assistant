"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"

export default function ComingSoonPage() {
  const [netid, setNetid]     = useState("")
  const [done, setDone]       = useState(false)
  const [error, setError]     = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = netid.trim().toLowerCase()
    if (!trimmed) return
    const email = `${trimmed}@illinois.edu`
    setLoading(true)
    setError("")
    const supabase = createClient()
    const { error: err } = await supabase.from("waitlist").insert({ email })
    if (err) {
      if (err.code === "23505") setDone(true)
      else setError(err.message)
    } else {
      setDone(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-100 px-6">
      <div className="w-full max-w-md text-center space-y-8">

        {/* Logo + title */}
        <div className="space-y-3">
          <div className="text-5xl">🏠</div>
          <h1 className="text-3xl font-bold text-neutral-900 leading-snug">
            AI-Powered Housing Search<br />for UIUC Students
          </h1>
          <p className="text-neutral-500 text-sm leading-relaxed max-w-sm mx-auto">
            Search hundreds of real listings near campus using plain English —
            no filters, no scrolling, just ask.
          </p>
        </div>

        {/* Coming soon badge */}
        <div className="inline-block px-4 py-1.5 rounded-full border border-neutral-300 text-xs font-semibold uppercase tracking-widest text-neutral-500">
          Private Beta — Coming Soon
        </div>

        {/* Waitlist form */}
        {done ? (
          <div className="bg-white rounded-2xl px-8 py-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.08)] space-y-2">
            <p className="font-semibold text-neutral-900">You&apos;re on the list!</p>
            <p className="text-sm text-neutral-500">
              We&apos;ll email <span className="font-mono" style={{ color: "#7B90A0" }}>{netid.trim().toLowerCase()}@illinois.edu</span> when beta opens.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl px-8 py-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.08)] space-y-4">
            <p className="text-sm font-medium text-neutral-700">
              Join the waitlist for early access
            </p>
            <div className="flex gap-2">
              <div className="flex flex-1 items-center rounded-xl border border-neutral-200 overflow-hidden focus-within:ring-2 focus-within:ring-[#7B90A0]/40 transition">
                <input
                  type="text"
                  value={netid}
                  onChange={e => setNetid(e.target.value)}
                  placeholder="netid"
                  required
                  className="flex-1 px-4 py-2.5 text-sm placeholder-neutral-400 focus:outline-none bg-white"
                />
                <span className="pr-3 text-sm text-neutral-400 select-none">@illinois.edu</span>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 rounded-xl bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-700 transition-colors disabled:opacity-50 shrink-0"
              >
                {loading ? "…" : "Notify me"}
              </button>
            </div>
            {error && <p className="text-xs text-red-500 text-left">{error}</p>}
            <p className="text-xs text-neutral-400">
              @illinois.edu only · No spam · Unsubscribe anytime
            </p>
          </form>
        )}

        {/* Footer */}
        <p className="text-xs text-neutral-400">
          Built by{" "}
          <a
            href="https://github.com/shuyangzhang-ai-sde"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-neutral-600 transition-colors"
          >
            Shuyang Zhang
          </a>
        </p>

      </div>
    </div>
  )
}
