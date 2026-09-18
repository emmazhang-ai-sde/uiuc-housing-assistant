"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import UserMenu from "@/components/UserMenu"
import { heroDisplay, inter } from "@/lib/fonts"

const TABS = [
  { label: "Card", href: "/card" },
  { label: "Map",  href: "/map"  },
]

export default function AppHeader({ variant = "light" }: { variant?: "light" | "dark" }) {
  const path = usePathname()
  const [isAdmin, setIsAdmin] = useState(false)
  const dark = variant === "dark"

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
    <header className={`${inter.className} relative z-[90] flex justify-center px-4 pt-3 pb-2 shrink-0`}>
      <div className={`flex max-w-[calc(100vw-2rem)] items-center gap-3 h-11 pl-4 pr-2 backdrop-blur rounded-full shadow-[0_2px_10px_-4px_rgba(53,20,11,0.16)] ${
        dark
          ? "bg-espresso-brown/95 border border-warm-ivory/10"
          : "bg-warm-ivory/95 border border-mist-100"
      }`}>
        <Link
          href="/about"
          className={`${heroDisplay.className} text-lg font-normal uppercase leading-none transition-colors ${
            dark ? "text-warm-ivory hover:text-blush-pink" : "text-ink-900 hover:text-ink-900/70"
          }`}
        >
          UIUC Housing
        </Link>
        <div className="flex shrink-0 gap-1">
          {TABS.map(({ label, href }) => {
            const active = path.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  active
                    ? dark
                      ? "bg-warm-ivory text-espresso-brown"
                      : "bg-forest-green text-warm-ivory"
                    : dark
                      ? "text-warm-ivory/65 hover:text-warm-ivory hover:bg-warm-ivory/10"
                      : "text-ink-900/60 hover:text-ink-900 hover:bg-blush-pink"
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
                  ? dark
                    ? "bg-warm-ivory text-espresso-brown"
                    : "bg-forest-green text-warm-ivory"
                  : dark
                    ? "text-warm-ivory/65 hover:text-warm-ivory hover:bg-warm-ivory/10"
                    : "text-ink-900/60 hover:text-ink-900 hover:bg-blush-pink"
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
