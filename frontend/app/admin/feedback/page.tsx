"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import AppHeader from "@/components/AppHeader"
import AdminTabs from "@/components/admin/AdminTabs"
import { createClient } from "@/lib/supabase/client"

interface FeedbackRow {
  id: number
  email: string
  rating: number | null
  message: string | null
  image_url: string | null
  created_at: string
}

export default function AdminFeedbackPage() {
  const [email, setEmail] = useState<string | null | undefined>(undefined)
  const [rows, setRows] = useState<FeedbackRow[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null))
  }, [])

  useEffect(() => {
    if (email === null) router.replace("/login")
  }, [email, router])

  useEffect(() => {
    if (!email) return
    fetch("/api/admin/feedback")
      .then(async res => {
        if (res.status === 403) { setForbidden(true); return null }
        return res.json()
      })
      .then(data => { if (data) setRows(data.feedback ?? []) })
      .catch(() => setForbidden(true))
      .finally(() => setLoading(false))
  }, [email])

  if (forbidden) {
    return (
      <div className="h-screen flex items-center justify-center bg-neutral-100 text-neutral-500 text-sm">
        Not authorized.
      </div>
    )
  }

  return (
    <div className="relative h-screen bg-neutral-100 overflow-hidden">
      <div className="h-full overflow-y-auto pt-24 px-6 pb-10">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-bold text-neutral-900 mb-4">Feedback</h1>
          <AdminTabs />

          {loading ? (
            <div className="text-sm text-neutral-400">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-neutral-400">No feedback yet.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {rows.map(row => (
                <div
                  key={row.id}
                  className="bg-white rounded-2xl shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] p-5"
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="text-sm font-semibold text-neutral-700 truncate">{row.email}</span>
                    <span className="text-xs text-neutral-400 whitespace-nowrap">
                      {new Date(row.created_at).toLocaleString()}
                    </span>
                  </div>

                  {row.rating != null && (
                    <div className="text-lg mb-2" style={{ color: "#ff5f05" }}>
                      {"★".repeat(row.rating)}
                      <span className="text-neutral-200">{"★".repeat(5 - row.rating)}</span>
                    </div>
                  )}

                  {row.message && (
                    <p className="text-sm text-neutral-800 whitespace-pre-wrap mb-3">{row.message}</p>
                  )}

                  {row.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <a href={row.image_url} target="_blank" rel="noreferrer">
                      <img
                        src={row.image_url}
                        alt="Screenshot"
                        className="max-h-64 rounded-xl border border-neutral-200"
                      />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="absolute top-0 inset-x-0 z-30 pointer-events-none [&_header>div]:pointer-events-auto">
        <AppHeader />
      </div>
    </div>
  )
}
