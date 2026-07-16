"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import UserMenu from "@/components/UserMenu"
import { inter } from "@/lib/fonts"

const TABS = [
  { label: "Chat", href: "/chat" },
  { label: "Map",  href: "/map"  },
  { label: "Card", href: "/card" },
  { label: "Rate & Report", href: "/feedback" },
]

export default function AppHeader() {
  const path = usePathname()
  const [isAdmin, setIsAdmin] = useState(false)

  // The ADMIN_EMAIL set is server-only and never shipped to the browser
  // bundle (see app/api/admin/status/route.ts), so this tab's visibility is
  // asked of the server, not computed client-side. Non-admins never even
  // receive the markup for this link. Safe to call unauthenticated — the
  // route just resolves isAdmin: false when there's no session.
  useEffect(() => {
    fetch("/api/admin/status")
      .then(res => res.json())
      .then(data => setIsAdmin(!!data.isAdmin))
      .catch(() => setIsAdmin(false))
  }, [])

  return (
    <header className={`${inter.className} flex justify-center px-4 pt-3 pb-2 shrink-0`}>
      <div className="flex items-center gap-3 h-11 pl-4 pr-2 bg-white/95 backdrop-blur border border-mist-100 rounded-full shadow-[0_2px_10px_-4px_rgba(0,0,0,0.08)]">
        <Link
          href="/about"
          className="text-sm font-extrabold tracking-tight text-ink-900 hover:text-ink-900/70 transition-colors"
        >
          UIUC Housing
        </Link>
        <div className="flex gap-1">
          {TABS.map(({ label, href }) => {
            const active = path.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  active
                    ? "bg-ink-900 text-white"
                    : "text-neutral-500 hover:text-ink-900 hover:bg-mint-400/15"
                }`}
              >
                {label}
              </Link>
            )
          })}
          {isAdmin && (
            <Link
              href="/admin/activity"
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                path.startsWith("/admin")
                  ? "bg-ink-900 text-white"
                  : "text-neutral-500 hover:text-ink-900 hover:bg-mint-400/15"
              }`}
            >
              Admin Activity
            </Link>
          )}
        </div>
        <UserMenu />
      </div>
    </header>
  )
}
