"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"

export default function UserMenu() {
  const [email, setEmail] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null)
    })
    // Not a place to log 'login' — this listener's SIGNED_IN also fires on an
    // ordinary page refresh that resumes an existing session, not just on a
    // real new sign-in. The actual login event is logged once, deterministically,
    // right after verifyOtp succeeds in LoginCard.tsx.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  if (email === undefined) {
    return <div className="w-8 h-8 rounded-full bg-mist-100 shrink-0" />
  }

  if (email === null) {
    // Pre-launch, /login isn't a public route (see proxy.ts) — don't advertise
    // a link to it. Once NEXT_PUBLIC_LAUNCH_MODE flips to "live", it's real
    // again and safe to show.
    const launchMode = process.env.NEXT_PUBLIC_LAUNCH_MODE ?? "live"
    if (launchMode !== "live") return null

    return (
      <Link
        href="/login"
        className="px-3 py-1 rounded-full text-xs font-bold bg-mint-400 text-ink-900 hover:bg-[#00D68F] transition-colors shrink-0"
      >
        Log In
      </Link>
    )
  }

  return (
    <Link
      href="/account"
      className="flex items-center gap-2 pl-1 pr-1 py-1 rounded-full hover:bg-mist-100 transition-colors max-w-[220px] shrink-0"
      aria-label="Account"
    >
      <span className="text-xs font-medium text-neutral-600 truncate">{email}</span>
      <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-ink-900 bg-mint-400 shrink-0">
        {email.charAt(0).toUpperCase()}
      </span>
    </Link>
  )
}
