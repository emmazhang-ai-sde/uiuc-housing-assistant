"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { logEvent } from "@/lib/logEvent"

export default function UserMenu() {
  const [email, setEmail] = useState<string | null | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

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

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  async function handleSignOut() {
    setLoggingOut(true)
    setOpen(false)
    logEvent("logout")
    const supabase = createClient()
    await supabase.auth.signOut()
    setEmail(null)
    router.push("/login")
  }

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
        className="px-3 py-1 rounded-full text-xs font-bold bg-forest-green text-warm-ivory hover:bg-ink-900 transition-colors shrink-0"
      >
        Log In
      </Link>
    )
  }

  const emailLabel = email.split("@")[0]

  return (
    <div className="relative min-w-0 shrink" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex max-w-[150px] min-w-0 items-center gap-2 rounded-full py-1 pl-2 pr-1 transition-colors hover:bg-blush-pink"
      >
        <span className="min-w-0 truncate text-xs font-medium text-ink-900/60">{emailLabel}</span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest-green text-xs font-bold text-warm-ivory">
          {email.charAt(0).toUpperCase()}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-[100] mt-3 w-56 max-w-[calc(100vw-2rem)] rounded-2xl border border-mist-100 bg-warm-ivory p-2 shadow-[0_18px_40px_-18px_rgba(53,20,11,0.45)]"
        >
          <div className="px-3 py-2 text-xs leading-relaxed text-ink-900/55 break-all">
            {email}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            disabled={loggingOut}
            className="w-full rounded-xl px-3 py-2 text-left text-xs font-bold text-ink-900 transition-colors hover:bg-blush-pink disabled:opacity-50"
          >
            {loggingOut ? "Logging out..." : "Log out"}
          </button>
        </div>
      )}
    </div>
  )
}
