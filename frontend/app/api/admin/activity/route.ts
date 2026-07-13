import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAdminEmails, isAdminEmail } from "@/lib/adminEmails"
import { NextResponse } from "next/server"

// GET /api/admin/activity — powers /admin/activity. Gated to the ADMIN_EMAIL
// set (comma-separated); everyone else gets 403 even if they're logged in.
// The same admin/internal accounts are excluded from the numbers below, so
// the founder's own testing doesn't inflate real-user metrics.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const adminEmails = getAdminEmails()

  // `reason` names which gate failed so a 403 is diagnosable from the Network
  // tab without leaking the admin address itself. Safe to keep in prod.
  if (!user) return NextResponse.json({ error: "forbidden", reason: "not_logged_in" }, { status: 403 })
  if (adminEmails.size === 0) return NextResponse.json({ error: "forbidden", reason: "admin_email_env_missing" }, { status: 403 })
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: "forbidden", reason: "email_mismatch" }, { status: 403 })

  const admin = createAdminClient()

  // Recent rows (with email) drive the table. Pulled generously then filtered
  // of admin/internal rows in JS (case-insensitive, which a DB `not in` can't
  // guarantee against stored casing), and sliced to the display cap.
  const { data: recentRaw, error: recentErr } = await admin
    .from("events_with_email")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(600)

  if (recentErr) {
    console.error("GET /api/admin/activity (recent) failed:", recentErr)
    return NextResponse.json({ error: recentErr.message }, { status: 500 })
  }

  const recent = (recentRaw ?? []).filter(r => !isAdminEmail(r.email)).slice(0, 200)

  // Full pull (with email) for accurate aggregates — counting distinct users
  // off the capped feed would undercount as data grows. Admin/internal rows
  // are dropped before anything is counted.
  const { data: all, error: allErr } = await admin
    .from("events_with_email")
    .select("user_id, event_type, created_at, email")

  if (allErr) {
    console.error("GET /api/admin/activity (aggregate) failed:", allErr)
    return NextResponse.json({ error: allErr.message }, { status: 500 })
  }

  const rows = (all ?? []).filter(r => !isAdminEmail(r.email))

  const counts: Record<string, number> = {}
  const activeUsers = new Set<string>()
  const activeUsers24h = new Set<string>()
  const daysByUser = new Map<string, Set<string>>()
  const timesByUser = new Map<string, number[]>()

  const dayAgo = Date.now() - 24 * 60 * 60 * 1000
  // Calendar day in Central time (UIUC) so "returning on a different day"
  // matches how a local user experiences it, not a UTC midnight boundary.
  const dayFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
  })

  for (const r of rows) {
    counts[r.event_type] = (counts[r.event_type] ?? 0) + 1
    activeUsers.add(r.user_id)

    const t = new Date(r.created_at).getTime()
    if (t >= dayAgo) activeUsers24h.add(r.user_id)

    const day = dayFmt.format(new Date(r.created_at))
    if (!daysByUser.has(r.user_id)) daysByUser.set(r.user_id, new Set())
    daysByUser.get(r.user_id)!.add(day)

    if (!timesByUser.has(r.user_id)) timesByUser.set(r.user_id, [])
    timesByUser.get(r.user_id)!.push(t)
  }

  let returningUsers = 0
  for (const days of daysByUser.values()) {
    if (days.size >= 2) returningUsers++
  }

  // Return-frequency distribution — how many people came back N times, where a
  // "return" is an active day after the first (so distinct days - 1). Same
  // definition as returningUsers above, just not collapsed to a yes/no: the 0
  // bucket is the one-and-done crowd, and everything to its right is the tail
  // that returningUsers counts as a single number. Buckets are dense (a gap in
  // the middle is a real zero, and has to plot as one) and the long tail is
  // clamped so one heavy user can't stretch the axis.
  const TAIL_BUCKET = 10
  const returnCounts = new Map<number, number>()
  for (const days of daysByUser.values()) {
    const returns = Math.min(days.size - 1, TAIL_BUCKET)
    returnCounts.set(returns, (returnCounts.get(returns) ?? 0) + 1)
  }
  const maxReturns = returnCounts.size ? Math.max(...returnCounts.keys()) : 0
  const returnFrequency = Array.from({ length: maxReturns + 1 }, (_, returns) => ({
    returns,
    users: returnCounts.get(returns) ?? 0,
    capped: returns === TAIL_BUCKET,
  }))

  // Usage duration, estimated from event timestamps. We only log discrete
  // actions (not a heartbeat), so a "session" is a run of one user's events
  // where consecutive events are <= 30 min apart, and its duration is the
  // span from its first to last event. A single-event session is 0s and is
  // excluded from the min so it doesn't peg every stat to zero.
  const SESSION_GAP_MS = 30 * 60 * 1000
  const sessionDurations: number[] = []   // seconds, per session
  const perUserTotals: number[] = []      // seconds, summed per user

  for (const times of timesByUser.values()) {
    times.sort((a, b) => a - b)
    let sessionStart = times[0]
    let prev = times[0]
    let userTotal = 0
    const pushSession = (end: number) => {
      const dur = (end - sessionStart) / 1000
      sessionDurations.push(dur)
      userTotal += dur
    }
    for (let i = 1; i < times.length; i++) {
      if (times[i] - prev > SESSION_GAP_MS) {
        pushSession(prev)
        sessionStart = times[i]
      }
      prev = times[i]
    }
    pushSession(prev)
    perUserTotals.push(userTotal)
  }

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const nonZeroSessions = sessionDurations.filter(d => d > 0)

  const duration = {
    avg_session_sec: Math.round(mean(sessionDurations)),
    avg_per_user_sec: Math.round(mean(perUserTotals)),
    max_session_sec: sessionDurations.length ? Math.round(Math.max(...sessionDurations)) : 0,
    // Shortest real (multi-event) session; 0 only when there are none.
    min_session_sec: nonZeroSessions.length ? Math.round(Math.min(...nonZeroSessions)) : 0,
  }

  // Registered accounts (the activation denominator: everyone who has an
  // account, i.e. was invited/signed up) via the admin auth API, so this
  // needs no extra SQL. Admin/internal accounts are excluded to match the
  // numerator. Paginated to stay correct as the user base grows; a failure
  // here shouldn't sink the whole dashboard, so registered stays 0.
  let registeredAccounts = 0
  const perPage = 1000
  for (let page = 1; ; page++) {
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage })
    if (listErr) { console.error("listUsers failed:", listErr); break }
    const users = list?.users ?? []
    registeredAccounts += users.filter(u => !isAdminEmail(u.email)).length
    if (users.length < perPage) break
  }

  // Waitlist signups — the other activation denominator (everyone who raised
  // their hand, whether or not they ever registered). Needs service_role to
  // have SELECT on public.waitlist; if the grant is missing this stays 0 and
  // the card shows a dash rather than breaking the page.
  let waitlistCount = 0
  const { count: wlCount, error: wlErr } = await admin
    .from("waitlist")
    .select("*", { count: "exact", head: true })
  if (wlErr) console.error("waitlist count failed:", wlErr)
  else waitlistCount = wlCount ?? 0

  const metrics = {
    active_users: activeUsers.size,
    active_24h: activeUsers24h.size,
    returning_users: returningUsers,
    registered_accounts: registeredAccounts,
    waitlist_count: waitlistCount,
    ...duration,
  }

  // Growth curve for "Users who've used it" — cumulative distinct users by
  // calendar day (Central time, matching returningUsers above), so the chart
  // shows how that single number grew rather than just its current value. A
  // user starts counting on the day of their first-ever event.
  const firstSeenDay = new Map<string, string>()
  for (const r of rows) {
    const day = dayFmt.format(new Date(r.created_at))
    const existing = firstSeenDay.get(r.user_id)
    if (!existing || day < existing) firstSeenDay.set(r.user_id, day)
  }
  const newUsersByDay = new Map<string, number>()
  for (const day of firstSeenDay.values()) {
    newUsersByDay.set(day, (newUsersByDay.get(day) ?? 0) + 1)
  }
  const growth: { date: string; users: number }[] = []
  if (newUsersByDay.size > 0) {
    const sortedDays = [...newUsersByDay.keys()].sort()
    const addDays = (dateStr: string, n: number) => {
      const d = new Date(dateStr + "T00:00:00Z")
      d.setUTCDate(d.getUTCDate() + n)
      return d.toISOString().slice(0, 10)
    }
    const lastDay = dayFmt.format(new Date())
    let cumulative = 0
    for (let day = sortedDays[0]; day <= lastDay; day = addDays(day, 1)) {
      cumulative += newUsersByDay.get(day) ?? 0
      growth.push({ date: day, users: cumulative })
    }
  }

  // Tag each table row as "new" (this event happened on the user's first-ever
  // active day) or "old"/returning (a later day) — lets the table split into
  // New users / Old users tabs without a separate query.
  const recentAnnotated = recent.map(r => ({
    ...r,
    is_new_user: dayFmt.format(new Date(r.created_at)) === firstSeenDay.get(r.user_id),
  }))

  return NextResponse.json({ events: recentAnnotated, counts, metrics, growth, returnFrequency })
}
