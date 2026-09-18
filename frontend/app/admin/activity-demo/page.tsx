"use client"

// Editable copy of /admin/activity, for screenshots, demos and design work
// where the real dashboard can't be used (it shows real users' emails and real
// numbers). This page NEVER calls /api/admin/activity — every number below
// comes from local state seeded with sample data, editable in the panel at the
// top, and persisted to localStorage so edits survive a reload.
//
// The dashboard section is a deliberate duplicate of the real page's markup
// (same cards, same charts, same table) so a screenshot of it looks exactly
// like the real thing. Keep the two in sync by hand: the point of the copy is
// that editing this file can't break the real dashboard.

import { useMemo, useState, useSyncExternalStore } from "react"
import AppHeader from "@/components/AppHeader"
import AdminTabs from "@/components/admin/AdminTabs"
import GrowthChart from "@/components/admin/GrowthChart"
import ReturnFrequencyChart, { type ReturnBucket } from "@/components/admin/ReturnFrequencyChart"

const PAGE_SIZE = 20
const STORAGE_KEY = "admin-activity-demo-v1"
const TAIL_BUCKET = 10 // matches the API's clamp, so the last bucket renders as "10+"

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

interface DemoCount {
  id: number
  label: string
  count: number
}

interface DemoEvent {
  id: number
  email: string
  event: string
  metadata: string
  // Naive local timestamp ("YYYY-MM-DDTHH:mm"), which is exactly what a
  // datetime-local input reads and writes. The real API returns UTC ISO
  // strings; both render the same through toLocaleString(), and this way the
  // editor needs no timezone conversion.
  created_at: string
  is_new_user: boolean
}

interface DemoData {
  metrics: Metrics
  counts: DemoCount[]
  growth: { date: string; users: number }[]
  returnFrequency: { returns: number; users: number }[]
  events: DemoEvent[]
}

// Sample data. Internally consistent on purpose: growth ends at active_users
// (43), and the return buckets sum to active_users with bucket 0 holding the
// 25 people who never came back (43 - 18 returning).
const SEED: DemoData = {
  metrics: {
    active_users: 43,
    active_24h: 9,
    returning_users: 18,
    registered_accounts: 61,
    waitlist_count: 96,
    avg_session_sec: 252,
    avg_per_user_sec: 861,
    max_session_sec: 3480,
    min_session_sec: 41,
  },
  counts: [
    { id: 1, label: "Messages sent", count: 412 },
    { id: 2, label: "Card views", count: 203 },
    { id: 3, label: "Listings viewed", count: 167 },
    { id: 4, label: "Logins", count: 128 },
    { id: 5, label: "Chats opened", count: 96 },
    { id: 6, label: "Map searches", count: 74 },
    { id: 7, label: "Table views", count: 58 },
    { id: 8, label: "Logouts", count: 39 },
  ],
  growth: [
    { date: "2026-06-22", users: 2 },
    { date: "2026-06-23", users: 4 },
    { date: "2026-06-24", users: 5 },
    { date: "2026-06-25", users: 7 },
    { date: "2026-06-26", users: 9 },
    { date: "2026-06-27", users: 10 },
    { date: "2026-06-28", users: 11 },
    { date: "2026-06-29", users: 13 },
    { date: "2026-06-30", users: 15 },
    { date: "2026-07-01", users: 16 },
    { date: "2026-07-02", users: 18 },
    { date: "2026-07-03", users: 20 },
    { date: "2026-07-04", users: 21 },
    { date: "2026-07-05", users: 26 },
    { date: "2026-07-06", users: 31 },
    { date: "2026-07-07", users: 34 },
    { date: "2026-07-08", users: 36 },
    { date: "2026-07-09", users: 38 },
    { date: "2026-07-10", users: 40 },
    { date: "2026-07-11", users: 42 },
    { date: "2026-07-12", users: 43 },
  ],
  returnFrequency: [
    { returns: 0, users: 25 },
    { returns: 1, users: 7 },
    { returns: 2, users: 5 },
    { returns: 3, users: 3 },
    { returns: 4, users: 2 },
    { returns: 5, users: 1 },
  ],
  // Placeholder addresses on example.edu, a domain reserved for documentation,
  // so no sample row can collide with a real person's address.
  events: [
    { id: 1, email: "jordan.p@example.edu", event: "Messages sent", metadata: '{"chars":84}', created_at: "2026-07-12T21:14", is_new_user: true },
    { id: 2, email: "jordan.p@example.edu", event: "Chats opened", metadata: "{}", created_at: "2026-07-12T21:12", is_new_user: true },
    { id: 3, email: "riley.k@example.edu", event: "Listings viewed", metadata: '{"listing_id":"green-st-402"}', created_at: "2026-07-12T20:48", is_new_user: true },
    { id: 4, email: "riley.k@example.edu", event: "Map searches", metadata: '{"bounds":"campustown"}', created_at: "2026-07-12T20:41", is_new_user: true },
    { id: 5, email: "sam.o@example.edu", event: "Logins", metadata: "{}", created_at: "2026-07-12T19:57", is_new_user: true },
    { id: 6, email: "avery.l@example.edu", event: "Card views", metadata: '{"count":12}', created_at: "2026-07-12T18:30", is_new_user: true },
    { id: 7, email: "dana.w@example.edu", event: "Messages sent", metadata: '{"chars":151}', created_at: "2026-07-12T17:05", is_new_user: false },
    { id: 8, email: "dana.w@example.edu", event: "Table views", metadata: "{}", created_at: "2026-07-12T17:01", is_new_user: false },
    { id: 9, email: "chris.m@example.edu", event: "Listings viewed", metadata: '{"listing_id":"tanner-1b"}', created_at: "2026-07-12T15:22", is_new_user: false },
    { id: 10, email: "chris.m@example.edu", event: "Map searches", metadata: '{"bounds":"north-campus"}', created_at: "2026-07-12T15:18", is_new_user: false },
    { id: 11, email: "taylor.b@example.edu", event: "Logins", metadata: "{}", created_at: "2026-07-12T14:09", is_new_user: false },
    { id: 12, email: "morgan.s@example.edu", event: "Messages sent", metadata: '{"chars":62}', created_at: "2026-07-11T22:47", is_new_user: false },
  ],
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

// The two series are edited as text ("date, users" per line) rather than as a
// row of inputs: they're the fields most likely to be pasted in bulk from a
// spreadsheet, and a 21-line series is miserable to retype one box at a time.
function growthToText(rows: { date: string; users: number }[]): string {
  return rows.map(r => `${r.date}, ${r.users}`).join("\n")
}

function parseGrowth(text: string): { date: string; users: number }[] {
  return text
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [date, users] = line.split(",").map(p => p.trim())
      return { date: date ?? "", users: Number(users) || 0 }
    })
    .filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date))
}

function bucketsToText(rows: { returns: number; users: number }[]): string {
  return rows.map(r => `${r.returns}, ${r.users}`).join("\n")
}

function parseBuckets(text: string): { returns: number; users: number }[] {
  return text
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [returns, users] = line.split(",").map(p => p.trim())
      return { returns: Number(returns) || 0, users: Number(users) || 0 }
    })
}

// --- The dataset, held in localStorage and read as an external store ---------
//
// The saved blob is the source of truth, so it can't be mirrored into state and
// loaded in an effect (that's a cascading render, and it desyncs the first
// paint from what's stored). useSyncExternalStore is the shape React wants:
// getServerSnapshot hands back the sample data so the SSR pass and hydration
// agree, then the stored blob takes over on the client.
//
// `current` is the in-memory copy and the thing snapshots are read from, so it
// has to be referentially stable across renders. It also means editing still
// works when localStorage throws (private mode, quota); the writes are a mirror,
// not the state itself.
let current: DemoData | null = null
let listeners: (() => void)[] = []

// Merged over SEED so a hand-edited or older JSON blob missing a key still loads.
function normalize(incoming: Partial<DemoData>): DemoData {
  return {
    metrics: { ...SEED.metrics, ...(incoming.metrics ?? {}) },
    counts: incoming.counts ?? SEED.counts,
    growth: incoming.growth ?? SEED.growth,
    returnFrequency: incoming.returnFrequency ?? SEED.returnFrequency,
    events: incoming.events ?? SEED.events,
  }
}

function subscribe(listener: () => void): () => void {
  listeners = [...listeners, listener]
  return () => {
    listeners = listeners.filter(l => l !== listener)
  }
}

function getSnapshot(): DemoData {
  if (current === null) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      current = raw ? normalize(JSON.parse(raw) as Partial<DemoData>) : SEED
    } catch {
      current = SEED // A corrupt or unreadable blob just falls back to the sample data.
    }
  }
  return current
}

function getServerSnapshot(): DemoData {
  return SEED
}

function writeStore(next: DemoData) {
  current = next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Private mode / quota. Edits still hold for this session.
  }
  listeners.forEach(l => l())
}

// Ids only need to be unique within the dataset, and it can arrive from an
// imported blob, so derive them from what's there rather than a running counter.
function nextId(rows: { id: number }[]): number {
  return Math.max(0, ...rows.map(r => r.id)) + 1
}

export default function AdminActivityDemoPage() {
  const data = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  // The two series are edited as free text, so a keystroke can't round-trip
  // through the parser without the caret fighting the reformat. The draft holds
  // the raw text while it's being typed; null means "show what's in the data",
  // which is also how a Reset or a JSON import re-syncs the boxes.
  const [growthDraft, setGrowthDraft] = useState<string | null>(null)
  const [bucketDraft, setBucketDraft] = useState<string | null>(null)
  const [showEditor, setShowEditor] = useState(true)
  const [importText, setImportText] = useState("")
  const [importError, setImportError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [userTab, setUserTab] = useState<"new" | "old">("new")
  const [page, setPage] = useState(1)

  const { metrics, counts, growth, events } = data
  const growthText = growthDraft ?? growthToText(growth)
  const bucketText = bucketDraft ?? bucketsToText(data.returnFrequency)

  function update(fn: (d: DemoData) => DemoData) {
    writeStore(fn(data))
  }

  function applyData(incoming: Partial<DemoData>) {
    writeStore(normalize(incoming))
    setGrowthDraft(null)
    setBucketDraft(null)
    setPage(1)
  }

  // Only the last bucket carries the "10+" cap, matching the API's clamp.
  const returnFrequency: ReturnBucket[] = useMemo(
    () => data.returnFrequency.map(b => ({ ...b, capped: b.returns >= TAIL_BUCKET })),
    [data.returnFrequency]
  )

  const newEvents = events.filter(e => e.is_new_user)
  const oldEvents = events.filter(e => !e.is_new_user)
  const tabEvents = userTab === "new" ? newEvents : oldEvents
  const totalPages = Math.max(1, Math.ceil(tabEvents.length / PAGE_SIZE))
  // Clamp rather than reset: deleting rows can strand you past the last page.
  const safePage = Math.min(page, totalPages)
  const pageEvents = tabEvents.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function switchUserTab(tab: "new" | "old") {
    setUserTab(tab)
    setPage(1)
  }

  function setMetric(key: keyof Metrics, value: number) {
    update(d => ({ ...d, metrics: { ...d.metrics, [key]: value } }))
  }

  function updateCount(id: number, patch: Partial<DemoCount>) {
    update(d => ({ ...d, counts: d.counts.map(c => (c.id === id ? { ...c, ...patch } : c)) }))
  }

  function addCount() {
    update(d => ({ ...d, counts: [...d.counts, { id: nextId(d.counts), label: "New metric", count: 0 }] }))
  }

  function removeCount(id: number) {
    update(d => ({ ...d, counts: d.counts.filter(c => c.id !== id) }))
  }

  function updateEvent(id: number, patch: Partial<DemoEvent>) {
    update(d => ({ ...d, events: d.events.map(e => (e.id === id ? { ...e, ...patch } : e)) }))
  }

  function duplicateEvent(id: number) {
    update(d => {
      const i = d.events.findIndex(e => e.id === id)
      if (i === -1) return d
      const events = [...d.events]
      events.splice(i + 1, 0, { ...d.events[i], id: nextId(d.events) })
      return { ...d, events }
    })
  }

  function removeEvent(id: number) {
    update(d => ({ ...d, events: d.events.filter(e => e.id !== id) }))
  }

  function addEvent() {
    update(d => ({
      ...d,
      events: [
        {
          id: nextId(d.events),
          email: "someone@example.edu",
          event: "Messages sent",
          metadata: "{}",
          created_at: d.events[0]?.created_at ?? "2026-07-12T12:00",
          is_new_user: userTab === "new",
        },
        ...d.events,
      ],
    }))
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setImportError("Could not reach the clipboard. Copy the JSON from the box below instead.")
      setImportText(JSON.stringify(data, null, 2))
    }
  }

  function applyImport() {
    try {
      const parsed = JSON.parse(importText) as Partial<DemoData>
      applyData(parsed)
      setImportError(null)
      setImportText("")
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "That is not valid JSON.")
    }
  }

  function reset() {
    applyData(SEED)
    setImportText("")
    setImportError(null)
  }

  return (
    <div className="relative h-screen bg-neutral-100 overflow-hidden">
      <div className="h-full overflow-y-auto pt-24 px-6 pb-10">
        <div className="max-w-7xl mx-auto">
          {showEditor && (
            <div className="bg-white rounded-2xl shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] p-5 mb-6">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                      Demo data
                    </span>
                    <h2 className="text-sm font-semibold text-neutral-700">Edit the numbers</h2>
                  </div>
                  <p className="text-xs text-neutral-400 mt-1 max-w-2xl">
                    Nothing on this page is loaded from Supabase. Everything below the editor is sample data you can
                    change, saved in this browser only. The real dashboard lives at /admin/activity and is untouched.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={copyJson}
                    className="px-3 py-1.5 rounded-full bg-neutral-100 text-sm font-medium text-neutral-700 hover:bg-neutral-200"
                  >
                    {copied ? "Copied" : "Copy JSON"}
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    className="px-3 py-1.5 rounded-full bg-neutral-100 text-sm font-medium text-neutral-700 hover:bg-neutral-200"
                  >
                    Reset to sample
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEditor(false)}
                    className="px-3 py-1.5 rounded-full bg-neutral-900 text-sm font-medium text-white hover:bg-neutral-800"
                  >
                    Hide editor
                  </button>
                </div>
              </div>

              <Section title="Key metrics" hint="The percentages on the cards are computed from these, exactly like the real page.">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <NumberField label="Active users" value={metrics.active_users} onChange={v => setMetric("active_users", v)} />
                  <NumberField label="Registered accounts" value={metrics.registered_accounts} onChange={v => setMetric("registered_accounts", v)} />
                  <NumberField label="Waitlist signups" value={metrics.waitlist_count} onChange={v => setMetric("waitlist_count", v)} />
                  <NumberField label="Active in last 24h" value={metrics.active_24h} onChange={v => setMetric("active_24h", v)} />
                  <NumberField label="Returning users" value={metrics.returning_users} onChange={v => setMetric("returning_users", v)} />
                </div>
              </Section>

              <Section title="Session length" hint="In seconds. The cards format them as 4m 12s, 1h 3m and so on.">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <NumberField label="Avg session" value={metrics.avg_session_sec} onChange={v => setMetric("avg_session_sec", v)} suffix={formatDuration(metrics.avg_session_sec)} />
                  <NumberField label="Avg per user" value={metrics.avg_per_user_sec} onChange={v => setMetric("avg_per_user_sec", v)} suffix={formatDuration(metrics.avg_per_user_sec)} />
                  <NumberField label="Longest session" value={metrics.max_session_sec} onChange={v => setMetric("max_session_sec", v)} suffix={formatDuration(metrics.max_session_sec)} />
                  <NumberField label="Shortest session" value={metrics.min_session_sec} onChange={v => setMetric("min_session_sec", v)} suffix={formatDuration(metrics.min_session_sec)} />
                </div>
              </Section>

              <Section title="Feature usage" hint="One chip per row. The label is free text, so you can rename or add events the real app does not log yet.">
                <div className="flex flex-col gap-2">
                  {counts.map(c => (
                    <div key={c.id} className="flex items-center gap-2">
                      <input
                        value={c.label}
                        onChange={e => updateCount(c.id, { label: e.target.value })}
                        className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-neutral-400"
                      />
                      <input
                        type="number"
                        value={c.count}
                        onChange={e => updateCount(c.id, { count: Number(e.target.value) || 0 })}
                        className="w-24 px-3 py-1.5 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-neutral-400"
                      />
                      <RemoveButton onClick={() => removeCount(c.id)} />
                    </div>
                  ))}
                  <AddButton onClick={addCount}>Add a chip</AddButton>
                </div>
              </Section>

              <Section title="Growth curve" hint="One line per day, as date, cumulative users. Dates must be YYYY-MM-DD, and the series should only go up.">
                <textarea
                  value={growthText}
                  onChange={e => {
                    setGrowthDraft(e.target.value)
                    update(d => ({ ...d, growth: parseGrowth(e.target.value) }))
                  }}
                  rows={6}
                  spellCheck={false}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm font-mono focus:outline-none focus:border-neutral-400"
                />
              </Section>

              <Section title="Return frequency" hint="One line per bar, as times came back, number of people. Row 0 is everyone who never came back. A bucket of 10 or more renders as 10+.">
                <textarea
                  value={bucketText}
                  onChange={e => {
                    setBucketDraft(e.target.value)
                    update(d => ({ ...d, returnFrequency: parseBuckets(e.target.value) }))
                  }}
                  rows={5}
                  spellCheck={false}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm font-mono focus:outline-none focus:border-neutral-400"
                />
              </Section>

              <Section title="Event rows" hint="These fill the table at the bottom. New or Old decides which tab a row lands in.">
                <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
                  {events.map(e => (
                    <div key={e.id} className="flex flex-wrap items-center gap-2">
                      <input
                        value={e.email}
                        onChange={ev => updateEvent(e.id, { email: ev.target.value })}
                        placeholder="Email"
                        className="flex-1 min-w-40 px-3 py-1.5 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-neutral-400"
                      />
                      <input
                        value={e.event}
                        onChange={ev => updateEvent(e.id, { event: ev.target.value })}
                        placeholder="Event"
                        className="w-36 px-3 py-1.5 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-neutral-400"
                      />
                      <input
                        value={e.metadata}
                        onChange={ev => updateEvent(e.id, { metadata: ev.target.value })}
                        placeholder="Metadata"
                        spellCheck={false}
                        className="flex-1 min-w-40 px-3 py-1.5 rounded-lg border border-neutral-200 text-sm font-mono focus:outline-none focus:border-neutral-400"
                      />
                      <input
                        type="datetime-local"
                        value={e.created_at}
                        onChange={ev => updateEvent(e.id, { created_at: ev.target.value })}
                        className="px-3 py-1.5 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-neutral-400"
                      />
                      <button
                        type="button"
                        onClick={() => updateEvent(e.id, { is_new_user: !e.is_new_user })}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium w-16 ${
                          e.is_new_user ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600"
                        }`}
                      >
                        {e.is_new_user ? "New" : "Old"}
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicateEvent(e.id)}
                        title="Duplicate this row"
                        className="w-8 h-8 rounded-lg bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-700 text-sm"
                      >
                        ⧉
                      </button>
                      <RemoveButton onClick={() => removeEvent(e.id)} />
                    </div>
                  ))}
                </div>
                <div className="mt-2">
                  <AddButton onClick={addEvent}>Add a row</AddButton>
                </div>
              </Section>

              <Section title="Load JSON" hint="Paste a dataset shaped like the one Copy JSON produces. Handy for keeping several scenarios around in a scratch file.">
                <textarea
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                  rows={4}
                  spellCheck={false}
                  placeholder='{"metrics": {...}, "counts": [...], "growth": [...], "returnFrequency": [...], "events": [...]}'
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm font-mono focus:outline-none focus:border-neutral-400"
                />
                <div className="flex items-center gap-3 mt-2">
                  <button
                    type="button"
                    onClick={applyImport}
                    disabled={!importText.trim()}
                    className="px-3 py-1.5 rounded-full bg-neutral-900 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Apply
                  </button>
                  {importError && <span className="text-xs text-red-500">{importError}</span>}
                </div>
              </Section>
            </div>
          )}

          {/* ---------- Everything below mirrors /admin/activity exactly ---------- */}

          <h1 className="text-xl font-bold text-neutral-900 mb-4">Activity</h1>
          <AdminTabs />

          {/* Key metrics — distinct people, not raw event counts */}
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

          {/* Usage duration — estimated from event timestamps */}
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

          {/* Feature usage — raw event counts */}
          <div className="flex flex-wrap gap-3 mb-8">
            {counts.map(c => (
              <div
                key={c.id}
                className="bg-white rounded-2xl shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] px-4 py-3"
              >
                <div className="text-2xl font-bold text-neutral-900">{c.count}</div>
                <div className="text-xs text-neutral-500">{c.label}</div>
              </div>
            ))}
            {counts.length === 0 && (
              <div className="text-sm text-neutral-400">No activity logged yet.</div>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-6">
            <div className="bg-white rounded-2xl shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] px-5 py-4">
              <div className="text-sm font-semibold text-neutral-700">Users who&apos;ve used it</div>
              <div className="text-xs text-neutral-400 mt-0.5 mb-2">Cumulative distinct people who&apos;ve done any action, by day</div>
              <GrowthChart data={growth} />
            </div>

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
                    <td className="px-4 py-2.5 text-neutral-700 whitespace-nowrap">{e.event}</td>
                    <td className="px-4 py-2.5 text-neutral-400 max-w-xs truncate">{e.metadata}</td>
                    <td className="px-4 py-2.5 text-neutral-400 whitespace-nowrap">
                      {e.created_at ? new Date(e.created_at).toLocaleString() : ""}
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
                Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, tabEvents.length)} of {tabEvents.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="px-3 py-1.5 rounded-full bg-white shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-50"
                >
                  Previous
                </button>
                <span className="text-neutral-400">Page {safePage} of {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="px-3 py-1.5 rounded-full bg-white shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating handle when the editor is hidden, so a screenshot of the
          dashboard is free of edit chrome but the editor is one click away. */}
      {!showEditor && (
        <button
          type="button"
          onClick={() => setShowEditor(true)}
          className="fixed bottom-5 right-5 z-40 px-4 py-2 rounded-full bg-neutral-900 text-white text-sm font-medium shadow-lg hover:bg-neutral-800"
        >
          Edit data
        </button>
      )}

      <div className="absolute top-0 inset-x-0 z-30 pointer-events-none [&_header>div]:pointer-events-auto">
        <AppHeader />
      </div>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-neutral-100 pt-4 mt-4 first:border-t-0 first:pt-0 first:mt-0">
      <div className="text-sm font-semibold text-neutral-700">{title}</div>
      <div className="text-xs text-neutral-400 mt-0.5 mb-2.5">{hint}</div>
      {children}
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  suffix?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-neutral-500">
        {label}
        {suffix && <span className="text-neutral-400"> ({suffix})</span>}
      </span>
      <input
        type="number"
        value={value}
        onChange={e => onChange(Number(e.target.value) || 0)}
        className="px-3 py-1.5 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-neutral-400"
      />
    </label>
  )
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start px-3 py-1.5 rounded-full bg-neutral-100 text-sm font-medium text-neutral-700 hover:bg-neutral-200"
    >
      + {children}
    </button>
  )
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Remove"
      className="w-8 h-8 shrink-0 rounded-lg bg-neutral-100 text-neutral-400 hover:bg-red-50 hover:text-red-500 text-sm"
    >
      ×
    </button>
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
