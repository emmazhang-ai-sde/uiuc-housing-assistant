"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"

export default function LoginPage() {
  const [email, setEmail]     = useState("")
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.endsWith("@illinois.edu")) {
      setError("Only @illinois.edu email addresses are allowed.")
      return
    }
    setLoading(true)
    setError("")
    const supabase = createClient()
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })
    if (err) setError(err.message)
    else setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-100">
      <div className="bg-white rounded-3xl shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)] p-10 w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <span className="text-2xl">🏠</span>
          <div>
            <div className="font-bold text-neutral-900 text-[15px] leading-none">
              UIUC Housing Assistant
            </div>
            <div className="text-[10px] text-neutral-400 mt-1 uppercase tracking-widest font-medium">
              Champaign-Urbana, IL
            </div>
          </div>
        </div>

        {sent ? (
          <div className="text-sm text-neutral-600 leading-relaxed space-y-2">
            <p className="font-semibold text-neutral-900">Check your inbox</p>
            <p>
              We sent a sign-in link to{" "}
              <span className="font-mono text-[#7B90A0]">{email}</span>.
              Click it to continue.
            </p>
            <p className="text-xs text-neutral-400 pt-1">
              Didn&apos;t get it? Check your spam folder.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-neutral-400 block mb-2">
                Illinois email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="netid@illinois.edu"
                required
                className="w-full px-4 py-3 rounded-xl border border-neutral-200 text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#7B90A0]/40 transition"
              />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-700 transition-colors disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send sign-in link"}
            </button>
            <p className="text-xs text-neutral-400 text-center">
              Only @illinois.edu addresses are accepted.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
