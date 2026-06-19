"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { fetchStatus, DataStatus } from "@/lib/api"
import { COMPANIES } from "@/lib/companies"
import { createClient } from "@/lib/supabase/client"

export default function Sidebar({ onClear }: { onClear: () => void }) {
  const [status, setStatus]   = useState<DataStatus | null>(null)
  const [email, setEmail]     = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    fetchStatus().then(setStatus).catch(() => {})
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null)
    })
  }, [])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
  }

  const scrapedLabel = status?.last_scraped
    ? new Date(status.last_scraped + "T00:00:00").toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "—"

  return (
    <aside className="hidden md:flex flex-col w-72 bg-white shrink-0 h-full">
      <div className="p-6 overflow-y-auto flex-1">
        {/* Logo + Title */}
        <div className="flex items-center gap-3 mb-4 pb-2">
          <div className="w-9 h-9 flex items-center justify-center text-xl shrink-0">
            🏠
          </div>
          <div>
            <div className="font-bold text-neutral-900 text-[15px] leading-none">
              UIUC Housing Assistant
            </div>
            <div className="text-[10px] text-neutral-400 mt-1 uppercase tracking-widest font-medium">
              Champaign-Urbana, IL
            </div>
          </div>
        </div>

        {/* About */}
        <section className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-4">About</h2>
          <div className="space-y-3 text-sm text-neutral-600 leading-relaxed">

            {/* Data sources */}
            <div>
              <span className="font-semibold text-neutral-900">Data sources:</span>
              <ul className="mt-1.5 ml-3 space-y-1.5">
                {COMPANIES.map(({ name, logo }) => (
                  <li key={name} className="flex items-center gap-2">
                    <span className="text-glow-600 shrink-0">•</span>
                    <img src={logo} alt={name} className="h-4 object-contain" />
                  </li>
                ))}
              </ul>
            </div>

            {/* Listings */}
            <div>
              <span className="font-semibold text-neutral-900">Listings:</span>
              <ul className="mt-1.5 ml-3 space-y-1">
                <li className="flex items-center gap-2">
                  <span className="text-glow-600 shrink-0">•</span>
                  {status?.listing_count != null ? `${status.listing_count} floor plans` : "—"}
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-glow-600 shrink-0">•</span>
                  {status?.property_count != null ? `${status.property_count} properties` : "—"}
                </li>
              </ul>
            </div>

            <p><span className="font-semibold text-neutral-900">Last scraped:</span> {scrapedLabel}</p>
            <p><span className="font-semibold text-neutral-900">Area:</span> Champaign, IL (UIUC)</p>
          </div>
        </section>

        {/* Search Tips */}
        <section className="border-t border-neutral-100 pt-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-4">Search Tips</h2>
          <ul className="space-y-3 text-sm text-neutral-600">
            {[
              ['Mention bed count:', '"2BR" or "2 bedroom"'],
              ['Set a budget:', '"under $900/bed"'],
              ['Ask about location:', '"near Grainger"'],
              ['Availability:', '"August 2026"'],
            ].map(([label, example]) => (
              <li key={label} className="space-y-1">
                <span>{label}</span>
                <div className="flex gap-2 pl-5 leading-snug">
                  <span className="text-glow-600">•</span>
                  <span className="font-mono text-xs text-neutral-500">{example}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Footer: user + actions */}
      <div className="p-4 border-t border-neutral-100 space-y-2">
        {email && (
          <p className="text-xs text-center truncate px-1" style={{ color: "#7B90A0" }}>
            {email}
          </p>
        )}
        <div className="flex gap-2">
          <button
            onClick={onClear}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-neutral-700 bg-neutral-50 hover:bg-neutral-100 rounded-full transition-colors"
          >
            🗑 Clear
          </button>
          <button
            onClick={handleSignOut}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-neutral-500 bg-neutral-50 hover:bg-neutral-100 rounded-full transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>
  )
}
