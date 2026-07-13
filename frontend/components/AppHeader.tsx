"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import UserMenu from "@/components/UserMenu"

const TABS = [
  { label: "Chat", href: "/chat" },
  { label: "Map",  href: "/map"  },
  { label: "Card", href: "/card" },
  { label: "Table", href: "/table" },
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
    <header className="flex justify-center px-4 pt-3 pb-2 shrink-0">
      <div className="flex items-center gap-3 h-11 pl-4 pr-2 bg-white/90 backdrop-blur border border-neutral-200/80 rounded-full shadow-lg shadow-black/5">
        <Link
          href="/about"
          className="text-sm font-semibold text-neutral-800 hover:text-neutral-600 transition-colors"
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
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  active
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100"
                }`}
              >
                {label}
              </Link>
            )
          })}
          {isAdmin && (
            <Link
              href="/admin/activity"
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                path.startsWith("/admin")
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100"
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
