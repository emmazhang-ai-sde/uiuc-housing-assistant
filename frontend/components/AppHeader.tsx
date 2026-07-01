"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import UserMenu from "@/components/UserMenu"

const TABS = [
  { label: "Chat", href: "/chat" },
  { label: "Map",  href: "/map"  },
]

export default function AppHeader() {
  const path = usePathname()

  return (
    <header className="flex items-center gap-3 px-4 h-11 bg-white border-b border-neutral-100 shrink-0">
      <span className="text-sm font-semibold text-neutral-800 select-none">UIUC Housing</span>
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
      </div>
      <div className="ml-auto">
        <UserMenu />
      </div>
    </header>
  )
}
