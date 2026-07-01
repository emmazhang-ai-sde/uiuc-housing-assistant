"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export default function UserMenu() {
  const [email, setEmail] = useState<string | null | undefined>(undefined)
  const [open, setOpen]   = useState(false)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    setOpen(false)
    router.push("/login")
  }

  if (email === undefined) {
    return <div className="w-8 h-8 rounded-full bg-neutral-100 shrink-0" />
  }

  if (email === null) {
    return (
      <Link
        href="/login"
        className="px-3 py-1 rounded-full text-xs font-medium text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 transition-colors shrink-0"
      >
        Log In
      </Link>
    )
  }

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
        style={{ backgroundColor: "#7B90A0" }}
        aria-label="User menu"
      >
        {email.charAt(0).toUpperCase()}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-20 w-56 bg-white rounded-2xl shadow-[0_8px_30px_-12px_rgba(0,0,0,0.2)] border border-neutral-100 p-3">
            <p className="text-xs text-neutral-500 truncate px-1 pb-2 mb-1 border-b border-neutral-100">
              {email}
            </p>
            <button
              onClick={handleSignOut}
              className="w-full text-left px-1 py-1.5 text-sm font-medium text-neutral-700 hover:text-neutral-900 rounded-lg transition-colors"
            >
              Log out
            </button>
          </div>
        </>
      )}
    </div>
  )
}
