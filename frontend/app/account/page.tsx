"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import AppHeader from "@/components/AppHeader"
import { createClient } from "@/lib/supabase/client"

export default function AccountPage() {
  const [email, setEmail] = useState<string | null | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [onWaitlist, setOnWaitlist] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null)
    })
  }, [])

  // Waitlist badge — thanks the earliest users who signed up before launch.
  useEffect(() => {
    if (!email) return
    const supabase = createClient()
    supabase.rpc("is_email_on_waitlist", { p_email: email }).then(({ data }) => {
      setOnWaitlist(!!data)
    })
  }, [email])

  useEffect(() => {
    if (email === null) router.replace("/login")
  }, [email, router])

  async function handleSignOut() {
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
  }

  return (
    <div className="relative h-screen bg-neutral-100 overflow-hidden">
      <div className="h-full overflow-y-auto">
        <div className="min-h-full flex items-start justify-center pt-28 pb-10 px-6">
          {email && (
            <div className="w-full max-w-5xl bg-white rounded-3xl shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)] p-10">
              <div className="w-full max-w-[420px] mx-auto">
                <div className="flex flex-col items-center text-center mb-8">
                  <img
                    src="/logos/user-avatar.jpeg"
                    alt=""
                    className="w-16 h-16 rounded-full object-cover mb-4"
                  />
                  <div className="font-bold text-black text-[20px] leading-none break-all">{email}</div>
                  {onWaitlist && (
                    <div className="flex justify-center mt-2">
                      <span
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap bg-neutral-900 text-white"
                        title="You joined us from the beta waitlist. Thank you for being here early!"
                      >
                        🌟 Waitlist Member
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-10 pt-8 border-t border-neutral-200">
                <div className="mb-4">
                  <span className="text-sm font-semibold text-neutral-800">
                    Your saved property / unit
                  </span>
                </div>

                <div className="relative">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <SavedListingPlaceholder key={i} />
                    ))}
                  </div>

                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                    <span
                      className="whitespace-nowrap font-bold select-none"
                      style={{ fontSize: "2rem", transform: "rotate(-14deg)", color: "rgb(255, 95, 5)" }}
                    >
                      Your saved homes will appear here soon!
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-10 pt-8 border-t border-neutral-200">
                <div className="w-full max-w-[420px] mx-auto">
                  <button
                    onClick={handleSignOut}
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-neutral-900 text-white text-base font-semibold hover:bg-neutral-700 transition-colors disabled:opacity-50"
                  >
                    {loading ? "Logging out…" : "Log out"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating header pill, overlaid like the Chat/Map views */}
      <div className="absolute top-0 inset-x-0 z-30 pointer-events-none [&_header>div]:pointer-events-auto">
        <AppHeader />
      </div>
    </div>
  )
}

// Empty-state stand-in for a real saved ListingCard, sized to match it so the
// grid previews how a future "saved listings" section will look once populated.
function SavedListingPlaceholder() {
  return (
    <div className="relative rounded-3xl border-2 border-dashed border-neutral-300 flex flex-col overflow-hidden">
      <div className="h-36 shrink-0 border-b-2 border-dashed border-neutral-300" />
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="h-2.5 w-14 rounded-full border-2 border-dashed border-neutral-300" />
        <div className="h-3.5 w-3/4 rounded-full border-2 border-dashed border-neutral-300" />
        <div className="h-2.5 w-1/2 rounded-full border-2 border-dashed border-neutral-300" />
        <div className="flex flex-wrap gap-1.5 mt-auto">
          <div className="h-5 w-12 rounded-full border-2 border-dashed border-neutral-300" />
          <div className="h-5 w-12 rounded-full border-2 border-dashed border-neutral-300" />
        </div>
        <div className="flex items-end justify-between gap-2">
          <div className="h-6 w-16 rounded-full border-2 border-dashed border-neutral-300" />
          <div className="h-7 w-20 rounded-full border-2 border-dashed border-neutral-300" />
        </div>
      </div>
    </div>
  )
}
