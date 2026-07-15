"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import AppHeader from "@/components/AppHeader"
import AdminTabs from "@/components/admin/AdminTabs"
import GrowthChart from "@/components/admin/GrowthChart"
import ReturnFrequencyChart, { type ReturnBucket } from "@/components/admin/ReturnFrequencyChart"
import { createClient } from "@/lib/supabase/client"

interface EventRow {
  id: number
  user_id: string
  email: string
  event_type: string
  metadata: Record<string, unknown>
  created_at: string
  is_new_user?: boolean
}

const PAGE_SIZE = 20

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

// The three browse surfaces get their own top row in the feature-usage strip
// so they read as a comparable set. Order is deliberate: Map / Card / Table.
const VIEW_EVENTS = ["map_search", "card_view", "table_view"]

// Friendlier labels than the raw event_type slugs used in the DB.
const EVENT_LABELS: Record<string, string> = {
  login: "Logins",
  logout: "Logouts",
  conversation_open: "Chats opened",
  message_sent: "Messages sent",
  map_search: "Map searches",
  card_view: "Card views",
  table_view: "Table views",
  listing_view: "Listings viewed",
}

export default function AdminActivityPage() {
  const [email, setEmail] = useState<string | null | undefined>(undefined)
  const [events, setEvents] = useState<EventRow[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [userCounts, setUserCounts] = useState<Record<string, number>>({})
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [growth, setGrowth] = useState<{ date: string; users: number }[]>([])
  const [returnFrequency, setReturnFrequency] = useState<ReturnBucket[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [userTab, setUserTab] = useState<"new" | "old">("new")
  const [page, setPage] = useState(1)
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
        setUserCounts(data.userCounts ?? {})
        setMetrics(data.metrics ?? null)
        setGrowth(data.growth ?? [])
        setReturnFrequency(data.returnFrequency ?? [])
      })
      .catch(() => setForbidden(true))
      .finally(() => setLoading(false))
  }, [email])

  const newEvents = events.filter(e => e.is_new_user)
  const oldEvents = events.filter(e => !e.is_new_user)
  const tabEvents = userTab === "new" ? newEvents : oldEvents
  const totalPages = Math.max(1, Math.ceil(tabEvents.length / PAGE_SIZE))
  const pageEvents = tabEvents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function switchUserTab(tab: "new" | "old") {
    setUserTab(tab)
    setPage(1)
  }

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
        <div className="max-w-7xl mx-auto">
          <h1 className="text-xl font-bold text-neutral-900 mb-4">Activity</h1>
          <AdminTabs />

          {loading ? (
            <div className="text-sm text-neutral-400">Loading…</div>
          ) : (
            <>
              {/* Key metrics — distinct people, not raw event counts */}
              {metrics && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
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
                    value={metrics.active_24h}
                    label="Active in last 24h"
                    hint="Distinct people active since yesterday"
                  />
                  <MetricCard
                    value={pct(metrics.returning_users, metrics.active_users)}
                    label="Return rate"
                    hint={`${metrics.returning_users} of ${metrics.active_users} people who used it came back on a different day`}
                    accent
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

              {/* Feature usage — raw event counts. Top row is the three browse
                  surfaces (Map / Card / Table) so they read as a comparable
                  set; every other event drops to a second row. */}
              {Object.keys(counts).length === 0 ? (
                <div className="mb-8 text-sm text-neutral-400">No activity logged yet.</div>
              ) : (
                <div className="mb-8 space-y-3">
                  <div className="flex flex-wrap gap-3">
                    {VIEW_EVENTS.filter(type => counts[type] != null).map(type => (
                      <FeatureCard key={type} type={type} count={counts[type]} userCount={userCounts[type]} />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(counts)
                      .filter(([type]) => !VIEW_EVENTS.includes(type))
                      .map(([type, count]) => (
                        <FeatureCard key={type} type={type} count={count} userCount={userCounts[type]} />
                      ))}
                  </div>
                </div>
              )}

              {/* The two charts, side by side: who has used it, and how often
                  those people come back. Both are per-person views of the same
                  event log, so they read as a pair. They split at xl, not lg:
                  at 1024px a half column squeezes the chart's viewBox enough to
                  render the axis text at ~8px, so below that they stack full-width. */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-6">
                {metrics && (
                  <div className="bg-white rounded-2xl shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] px-5 py-4">
                    <div className="text-sm font-semibold text-neutral-700">Users who&apos;ve used it</div>
                    <div className="text-xs text-neutral-400 mt-0.5 mb-2">Cumulative distinct people who&apos;ve done any action, by day</div>
                    <GrowthChart data={growth} />
                  </div>
                )}

                {/* Return frequency — the distribution behind the return rate:
                    how many people came back once vs. five times */}
                {returnFrequency.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] px-5 py-4">
                    <div className="text-sm font-semibold text-neutral-700">How often people come back</div>
                    <div className="text-xs text-neutral-400 mt-0.5 mb-2">
                      Number of people by how many separate days they returned after their first visit. The grey bar is
                      everyone who never came back.
                    </div>
                    <ReturnFrequencyChart data={returnFrequency} />
                  </div>
                )}
              </div>

              {/* New vs. returning users — same event log, split by whether this
                  row happened on the user's first-ever active day */}
              <div className="flex items-center gap-1 bg-neutral-100 rounded-full p-0.5 mb-3 w-fit">
                <button
                  type="button"
                  onClick={() => switchUserTab("new")}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    userTab === "new" ? "bg-black text-white" : "text-neutral-600 hover:text-neutral-900"
                  }`}
                >
                  New users ({newEvents.length})
                </button>
                <button
                  type="button"
                  onClick={() => switchUserTab("old")}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    userTab === "old" ? "bg-black text-white" : "text-neutral-600 hover:text-neutral-900"
                  }`}
                >
                  Old users ({oldEvents.length})
                </button>
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
                    {pageEvents.map(e => (
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
                    {tabEvents.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                          No {userTab === "new" ? "new-user" : "returning-user"} activity yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {tabEvents.length > 0 && (
                <div className="flex items-center justify-between mt-3 text-sm text-neutral-500">
                  <span>
                    Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, tabEvents.length)} of {tabEvents.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-3 py-1.5 rounded-full bg-white shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-50"
                    >
                      Previous
                    </button>
                    <span className="text-neutral-400">Page {page} of {totalPages}</span>
                    <button
                      type="button"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="px-3 py-1.5 rounded-full bg-white shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
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

function FeatureCard({
  type,
  count,
  userCount,
}: {
  type: string
  count: number
  userCount?: number
}) {
  return (
    <div className="bg-white rounded-2xl shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] px-4 py-3">
      <div className="text-2xl font-bold text-neutral-900">{count}</div>
      <div className="text-xs text-neutral-500">{EVENT_LABELS[type] ?? type}</div>
      {userCount != null && (
        <div className="text-[11px] text-neutral-400 mt-0.5">
          {userCount} {userCount === 1 ? "person" : "people"}
        </div>
      )}
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
