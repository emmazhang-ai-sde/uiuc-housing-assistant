"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const ADMIN_TABS = [
  { label: "Activity", href: "/admin/activity" },
  { label: "Feedback", href: "/admin/feedback" },
]

// Sub-nav shared by the admin pages so the developer can switch between the
// activity dashboard and submitted feedback.
export default function AdminTabs() {
  const path = usePathname()
  return (
    <div className="flex gap-2 mb-6">
      {ADMIN_TABS.map(({ label, href }) => {
        const active = path.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              active
                ? "bg-neutral-900 text-white"
                : "bg-white text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {label}
          </Link>
        )
      })}
    </div>
  )
}
