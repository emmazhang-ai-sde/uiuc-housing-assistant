"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import AppHeader from "@/components/AppHeader"
import AdminTabs from "@/components/admin/AdminTabs"
import { createClient } from "@/lib/supabase/client"

interface EventRow {
  id: number
  user_id: string
  email: string
  event_type: string
  metadata: Record<string, unknown>
  created_at: string
}

interface Metrics {
  active_users: number
  active_24h: number
  returning_users: number
  registered_accounts: number
  waitlist_count: number
  avg_session_sec: number
  avg_per_user_sec: number
  max_session_sec: number
  min_session_sec: number
}

function pct(numerator: number, denominator: number): string {
  return denominator > 0 ? `${Math.round((numerator / denominator) * 100)}%` : "—"
}

// Seconds → "4m 12s" / "45s" / "1h 3m" for the duration cards.
function formatDuration(sec: number): string {
  if (!sec) return "0s"
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.round(sec % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// Friendlier labels than the raw event_type slugs used in the DB.
const EVENT_LABELS: Record<string, string> = {
  login: "Logins",
  logout: "Logouts",
  conversation_open: "Chats opened",
  message_sent: "Messages sent",
  map_search: "Map searches",
  card_view: "Card views",
  listing_view: "Listings viewed",
}

export default function AdminActivityPage() {
  const [email, setEmail] = useState<string | null | undefined>(undefined)
  const [events, setEvents] = useState<EventRow[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [metrics, setMetrics] = useState<Metrics | null>(null)
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

  // Server route re-checks ADMIN_EMAIL independently — this fetch is the real
  // data load, the check above is just so a logged-out visitor bounces to /login
  // instead of seeing a bare "Not authorized" flash.
  useEffect(() => {
    if (!email) return
    fetch("/api/admin/activity")
      .then(async res => {
        if (res.status === 403) { setForbidden(true); return null }
        return res.json()
      })
      .then(data => {
        if (!data) return
        setEvents(data.events ?? [])
        setCounts(data.counts ?? {})
        setMetrics(data.metrics ?? null)
      })
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
        <div className="max-w-5xl mx-auto">
          <h1 className="text-xl font-bold text-neutral-900 mb-4">Activity</h1>
          <AdminTabs />

          {loading ? (
            <div className="text-sm text-neutral-400">Loading…</div>
          ) : (
            <>
              {/* Key metrics — distinct people, not raw event counts */}
              {metrics && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
                  <MetricCard
                    value={pct(metrics.active_users, metrics.registered_accounts)}
                    label="Activation rate"
                    hint={`${metrics.active_users} of ${metrics.registered_accounts} accounts have used it`}
                    accent
                  />
                  <MetricCard
                    value={pct(metrics.active_users, metrics.waitlist_count)}
                    label="Waitlist conversion"
                    hint={`${metrics.active_users} of ${metrics.waitlist_count} waitlist signups have used it`}
                    accent
                  />
                  <MetricCard
                    value={metrics.active_users}
                    label="Users who've used it"
                    hint="Distinct people who did any action"
                  />
                  <MetricCard
                    value={metrics.active_24h}
                    label="Active in last 24h"
                    hint="Distinct people active since yesterday"
                  />
                  <MetricCard
                    value={metrics.returning_users}
                    label="Returning users"
                    hint="Came back on a different day"
                  />
                </div>
              )}

              {/* Usage duration — estimated from event timestamps */}
              {metrics && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                  <MetricCard
                    value={formatDuration(metrics.avg_session_sec)}
                    label="Avg session length"
                    hint="Per visit, across everyone"
                  />
                  <MetricCard
                    value={formatDuration(metrics.avg_per_user_sec)}
                    label="Avg time per user"
                    hint="Total time each person has spent"
                  />
                  <MetricCard
                    value={formatDuration(metrics.max_session_sec)}
                    label="Longest session"
                    hint="Single longest visit"
                  />
                  <MetricCard
                    value={formatDuration(metrics.min_session_sec)}
                    label="Shortest session"
                    hint="Shortest visit with 2+ actions"
                  />
                </div>
              )}

              {/* Feature usage — raw event counts */}
              <div className="flex flex-wrap gap-3 mb-8">
                {Object.entries(counts).map(([type, count]) => (
                  <div
                    key={type}
                    className="bg-white rounded-2xl shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] px-4 py-3"
                  >
                    <div className="text-2xl font-bold text-neutral-900">{count}</div>
                    <div className="text-xs text-neutral-500">{EVENT_LABELS[type] ?? type}</div>
                  </div>
                ))}
                {Object.keys(counts).length === 0 && (
                  <div className="text-sm text-neutral-400">No activity logged yet.</div>
                )}
              </div>

              <div className="bg-white rounded-2xl shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-neutral-400 border-b border-neutral-100">
                      <th className="px-4 py-3 font-semibold">Email</th>
                      <th className="px-4 py-3 font-semibold">Event</th>
                      <th className="px-4 py-3 font-semibold">Metadata</th>
                      <th className="px-4 py-3 font-semibold">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map(e => (
                      <tr key={e.id} className="border-b border-neutral-50 last:border-0">
                        <td className="px-4 py-2.5 text-neutral-700 whitespace-nowrap">{e.email}</td>
                        <td className="px-4 py-2.5 text-neutral-700 whitespace-nowrap">{EVENT_LABELS[e.event_type] ?? e.event_type}</td>
                        <td className="px-4 py-2.5 text-neutral-400 max-w-xs truncate">
                          {JSON.stringify(e.metadata)}
                        </td>
                        <td className="px-4 py-2.5 text-neutral-400 whitespace-nowrap">
                          {new Date(e.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="absolute top-0 inset-x-0 z-30 pointer-events-none [&_header>div]:pointer-events-auto">
        <AppHeader />
      </div>
    </div>
  )
}

function MetricCard({
  value,
  label,
  hint,
  accent = false,
}: {
  value: number | string
  label: string
  hint: string
  accent?: boolean
}) {
  return (
    <div className="bg-white rounded-2xl shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] px-5 py-4">
      <div className="text-3xl font-bold" style={{ color: accent ? "#ff5f05" : "#13294b" }}>{value}</div>
      <div className="text-sm font-semibold text-neutral-700 mt-1">{label}</div>
      <div className="text-xs text-neutral-400 mt-0.5">{hint}</div>
    </div>
  )
}
