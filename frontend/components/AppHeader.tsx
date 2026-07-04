"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import UserMenu from "@/components/UserMenu"

const TABS = [
  { label: "Chat", href: "/chat" },
  { label: "Map",  href: "/map"  },
  { label: "Card", href: "/"     },
]

export default function AppHeader() {
  const path = usePathname()

  return (
    <header className="relative flex items-center px-4 h-11 bg-white border-b border-neutral-100 shrink-0">
      <Link
        href="/about"
        className="text-sm font-semibold text-neutral-800 hover:text-neutral-600 transition-colors"
      >
        UIUC Housing
      </Link>
      <div className="absolute left-1/2 -translate-x-1/2 flex gap-1">
        {TABS.map(({ label, href }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href)
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
      </div>
      <div className="ml-auto">
        <UserMenu />
      </div>
    </header>
  )
}
