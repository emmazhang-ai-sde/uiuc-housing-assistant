"use client"

import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import ListingCard from "./ListingCard"
import SummaryTable from "./SummaryTable"
import { Listing, Filters } from "@/lib/api"
import { downloadElementPng } from "@/lib/exportDom"
import { LANDMARKS, Landmark } from "@/lib/landmarks"
import { availabilityStatus, availabilitySortValue } from "@/lib/availability"
import { fetchWalkingSeconds, fetchDrivingSeconds } from "@/lib/osrm"

const MapView = dynamic(() => import("./MapView"), { ssr: false })

type View = "cards" | "table" | "map"

function resolveLandmark(hint: unknown): Landmark | null {
  if (typeof hint !== "string" || !hint) return null
  const h = hint.toLowerCase()
  return LANDMARKS.find(lm => lm.aliases.some(a => h.includes(a) || a.includes(h))) ?? null
}

export default function AssistantMessage({
  answer,
  listings,
  maxPricePerBed,
  query,
  filters,
  filtersApplied,
  onSelect,
}: {
  answer: string
  listings: Listing[]
  maxPricePerBed: number | null
  query: string
  filters: Filters
  filtersApplied?: Record<string, unknown>
  onSelect?: (listing: Listing) => void
}) {
  const [view, setView] = useState<View>("cards")
  const [cardSaveStatus, setCardSaveStatus] = useState<"idle" | "saving" | "failed">("idle")
  const cardsRef = useRef<HTMLDivElement>(null)

  type SortBy = "default" | "unit" | "price" | "availability"
  const [sortBy, setSortBy] = useState<SortBy>("default")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  // Sort by walking distance
  const [sortLandmark, setSortLandmark] = useState<Landmark | null>(() =>
    resolveLandmark(filtersApplied?.location_hint)
  )
  const [walkSeconds, setWalkSeconds] = useState<(number | null)[] | null>(null)
  const [driveSeconds, setDriveSeconds] = useState<(number | null)[] | null>(null)
  const [loadingDistances, setLoadingDistances] = useState(false)
  const walkCache  = useRef<Map<string, (number | null)[]>>(new Map())
  const driveCache = useRef<Map<string, (number | null)[]>>(new Map())

  useEffect(() => {
    if (!sortLandmark) { setWalkSeconds(null); setDriveSeconds(null); return }
    const key = sortLandmark.name

    const cachedWalk  = walkCache.current.get(key)
    const cachedDrive = driveCache.current.get(key)
    if (cachedWalk && cachedDrive) {
      setWalkSeconds(cachedWalk); setDriveSeconds(cachedDrive); return
    }

    setLoadingDistances(true)
    Promise.all([
      cachedWalk  ? Promise.resolve(cachedWalk)
                  : fetchWalkingSeconds(sortLandmark.lat, sortLandmark.lng, listings),
      cachedDrive ? Promise.resolve(cachedDrive)
                  : fetchDrivingSeconds(sortLandmark.lat, sortLandmark.lng, listings),
    ])
      .then(([walk, drive]) => {
        walkCache.current.set(key, walk);  setWalkSeconds(walk)
        driveCache.current.set(key, drive); setDriveSeconds(drive)
      })
      .catch(() => { setWalkSeconds(null); setDriveSeconds(null) })
      .finally(() => setLoadingDistances(false))
  }, [sortLandmark])  // eslint-disable-line react-hooks/exhaustive-deps

  const sortedListings = useMemo(() => {
    const withMins = listings.map((l, i) => ({
      listing: l,
      walkMins:  walkSeconds?.[i]  != null ? Math.round(walkSeconds[i]!  / 60) : null,
      driveMins: driveSeconds?.[i] != null ? Math.round(driveSeconds[i]! / 60) : null,
    }))
    if (sortLandmark && walkSeconds) {
      return [...withMins].sort((a, b) => {
        if (a.walkMins == null && b.walkMins == null) return 0
        if (a.walkMins == null) return 1
        if (b.walkMins == null) return -1
        return a.walkMins - b.walkMins
      })
    }
    const dir = sortDir === "asc" ? 1 : -1
    if (sortBy === "unit") {
      return [...withMins].sort((a, b) => dir * (a.listing.beds - b.listing.beds))
    }
    if (sortBy === "price") {
      return [...withMins].sort((a, b) => {
        const pa = a.listing.price_per_bed_low ?? Infinity
        const pb = b.listing.price_per_bed_low ?? Infinity
        return dir * (pa - pb)
      })
    }
    if (sortBy === "availability") {
      const statusOrder = { now: 2, available: 1, unavailable: 0 } as const
      return [...withMins].sort((a, b) => {
        const oa = statusOrder[availabilityStatus(a.listing.availability)]
        const ob = statusOrder[availabilityStatus(b.listing.availability)]
        if (oa !== ob) return dir * (oa - ob)
        // same status group: earlier date first regardless of dir
        return availabilitySortValue(a.listing.availability) - availabilitySortValue(b.listing.availability)
      })
    }
    return withMins
  }, [listings, walkSeconds, driveSeconds, sortLandmark, sortBy, sortDir])

  const walkMinsByUrl = useMemo(() => {
    const m: Record<string, number | null> = {}
    sortedListings.forEach(({ listing, walkMins }) => { m[listing.url] = walkMins })
    return m
  }, [sortedListings])

  const answerBubble = answer ? (
    <div className="w-fit max-w-3xl bg-neutral-900 rounded-3xl rounded-tl-lg px-5 py-3.5 text-[15px] font-medium leading-relaxed text-white">
      {answer}
    </div>
  ) : null

  async function saveCardImages() {
    const cardGrid = cardsRef.current
    if (!cardGrid) return

    const cards = Array.from(cardGrid.children) as HTMLElement[]
    const chunks: HTMLElement[][] = []
    for (let i = 0; i < cards.length; i += 9) {
      chunks.push(cards.slice(i, i + 9))
    }

    setCardSaveStatus("saving")
    try {
      for (let i = 0; i < chunks.length; i += 1) {
        const exportGrid = document.createElement("div")
        // Keep in viewport so html2canvas can measure it; hide visually
        exportGrid.style.position = "fixed"
        exportGrid.style.top = "0"
        exportGrid.style.left = "0"
        exportGrid.style.zIndex = "-1"
        exportGrid.style.pointerEvents = "none"
        exportGrid.style.width = "1120px"
        exportGrid.style.padding = "16px"
        exportGrid.style.background = "#f5f5f5"
        exportGrid.style.display = "grid"
        exportGrid.style.gridTemplateColumns = "repeat(3, 1fr)"
        exportGrid.style.gap = "12px"

        chunks[i].forEach(card => {
          const clone = card.cloneNode(true) as HTMLElement
          // Expose the listing URL as visible text so it's readable in the PNG
          const anchor = clone.querySelector("a[href]")
          if (anchor) {
            const urlLabel = document.createElement("div")
            urlLabel.textContent = (anchor as HTMLAnchorElement).href
            urlLabel.style.fontSize = "9px"
            urlLabel.style.color = "#737373"
            urlLabel.style.wordBreak = "break-all"
            urlLabel.style.marginTop = "4px"
            urlLabel.style.paddingInline = "16px"
            urlLabel.style.paddingBottom = "12px"
            clone.appendChild(urlLabel)
          }
          exportGrid.appendChild(clone)
        })

        document.body.appendChild(exportGrid)
        try {
          await downloadElementPng(exportGrid, `uiuc-housing-cards-${i + 1}.png`)
        } finally {
          exportGrid.remove()
        }
      }
      setCardSaveStatus("idle")
    } catch (err) {
      console.error("Save cards PNG failed:", err)
      setCardSaveStatus("failed")
      window.setTimeout(() => setCardSaveStatus("idle"), 1600)
    }
  }

  return (
    <div className="flex items-start gap-3 my-4 pr-11">
      <div className="w-8 h-8 bg-neutral-200 rounded-full flex items-center justify-center shrink-0 text-sm mt-1">
        🏠
      </div>
      <div className="flex-1 min-w-0 space-y-4">
        {listings.length === 0 && answerBubble}

        {listings.length > 0 && (
          <>
            <SearchSummary count={listings.length} filters={filters} query={query} />

            {/* Sort bar */}
            <div className="bg-white rounded-2xl shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] px-5 py-3 flex items-center gap-3 text-sm flex-wrap">
              {/* Field sort pills */}
              <span className="text-neutral-900 text-sm font-semibold shrink-0">Sort</span>
              <div className="flex gap-1">
                {([["unit", "Unit"], ["price", "Price/bed"], ["availability", "Availability"]] as const).map(([key, label]) => {
                  const active = sortBy === key && !sortLandmark
                  const arrow = active ? (sortDir === "asc" ? " ↓" : " ↑") : " ↓"
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        if (sortBy === key && !sortLandmark) {
                          if (sortDir === "asc") setSortDir("desc")
                          else { setSortBy("default"); setSortDir("asc") }
                        } else {
                          setSortBy(key); setSortDir("asc")
                          setSortLandmark(null); setWalkSeconds(null)
                        }
                      }}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        active
                          ? "bg-black text-white"
                          : "bg-neutral-100 text-neutral-900 hover:bg-neutral-200"
                      }`}
                    >
                      {label}{arrow}
                    </button>
                  )
                })}
              </div>

              {/* Divider */}
              <div className="h-4 w-px bg-neutral-200 shrink-0" />

              {/* Distance sort */}
              <span className="text-neutral-900 text-sm font-semibold shrink-0">Distance</span>
              <select
                value={sortLandmark?.name ?? ""}
                onChange={e => {
                  const lm = LANDMARKS.find(l => l.name === e.target.value) ?? null
                  setSortLandmark(lm)
                  if (lm) setSortBy("default")
                }}
                className="text-sm rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1 text-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              >
                <option value="">Select a landmark…</option>
                {LANDMARKS.map(lm => (
                  <option key={lm.name} value={lm.name}>{lm.name}</option>
                ))}
              </select>
              {loadingDistances && (
                <span className="text-xs text-neutral-400">Loading…</span>
              )}
              {sortLandmark && !loadingDistances && (
                <button
                  onClick={() => { setSortLandmark(null); setWalkSeconds(null) }}
                  className="text-xs text-neutral-400 hover:text-neutral-700"
                  title="Clear sort"
                >
                  ✕
                </button>
              )}
            </div>

            {/* View controls */}
            <div className="flex justify-end items-center gap-2 flex-wrap">
              {view === "cards" && listings.length > 0 && (
                <button
                  onClick={saveCardImages}
                  disabled={cardSaveStatus === "saving"}
                  className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {cardSaveStatus === "saving" ? "Saving cards" : cardSaveStatus === "failed" ? "Save failed" : "Save cards PNG"}
                </button>
              )}

              <div className="flex items-center gap-1 bg-neutral-100 rounded-full p-0.5">
                <button
                  onClick={() => setView("cards")}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    view === "cards"
                      ? "bg-white text-neutral-900 shadow-[0_1px_4px_rgba(0,0,0,0.08)]"
                      : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  Cards
                </button>
                <button
                  onClick={() => setView("table")}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    view === "table"
                      ? "bg-white text-neutral-900 shadow-[0_1px_4px_rgba(0,0,0,0.08)]"
                      : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  Table
                </button>
                <button
                  onClick={() => setView("map")}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    view === "map"
                      ? "bg-white text-neutral-900 shadow-[0_1px_4px_rgba(0,0,0,0.08)]"
                      : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  Map
                </button>
              </div>
            </div>

            {/* Cards view */}
            {view === "cards" && (
              <div ref={cardsRef} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {sortedListings.map(({ listing, walkMins, driveMins }, i) => (
                  <ListingCard key={i} listing={listing} maxPricePerBed={maxPricePerBed} walkMins={walkMins} driveMins={driveMins} onSelect={onSelect} />
                ))}
              </div>
            )}

            {/* Table view */}
            {view === "table" && (
              <SummaryTable listings={sortedListings} maxPricePerBed={maxPricePerBed} />
            )}

            {/* Map view */}
            {view === "map" && <MapView listings={listings} walkMinsByUrl={walkMinsByUrl} />}
          </>
        )}
      </div>
    </div>
  )
}

function SearchSummary({
  count,
  filters,
  query,
}: {
  count: number
  filters: Filters
  query: string
}) {
  function formatBeds(beds: number[] | null): string {
    if (!beds || beds.length === 0) return "Any"
    const sorted = [...beds].sort((a, b) => a - b)
    const labels = sorted.map(b => {
      if (b === 0) return "Studio"
      if (b >= 4) return "4+"
      return `${b}`
    })
    return labels.join(", ") + (sorted.every(b => b === 0) ? "" : sorted[0] > 0 ? " bed" : "")
  }

  function formatBudget(): string {
    if (!filters.max_price_per_bed) return "No limit"
    const base = `≤ $${filters.max_price_per_bed.toLocaleString()}/bed`
    if (filters.buffer_type === "exact") return `${base} (exact)`
    if (filters.buffer_type === "percent" && filters.buffer_value)
      return `${base}  +${filters.buffer_value}%`
    if (filters.buffer_type === "fixed" && filters.buffer_value)
      return `${base}  +$${filters.buffer_value}`
    return base
  }

  const WINDOW_LABELS: Record<string, string> = {
    now: "Available Now",
    june_2026: "Jun '26",
    july_2026: "Jul '26",
    august_2026: "Aug '26",
    leased: "Leased",
  }
  const otherParts: string[] = []
  if (filters.availability_window) otherParts.push(WINDOW_LABELS[filters.availability_window] ?? filters.availability_window)
  if (filters.company) otherParts.push(filters.company)
  if (filters.property_type) otherParts.push(filters.property_type)

  const rows: { label: string; value: string }[] = [
    { label: "Bedroom",  value: formatBeds(filters.beds) },
    { label: "Budget",   value: formatBudget() },
    { label: "Query",    value: `"${query}"` },
    ...(otherParts.length ? [{ label: "Filter", value: otherParts.join(" · ") }] : []),
  ]

  return (
    <div className="w-fit max-w-3xl rounded-3xl rounded-tl-lg bg-neutral-900 px-5 py-3.5 text-sm leading-relaxed text-white">
      <div className="font-bold text-white underline">
        {count} unit{count !== 1 ? "s" : ""} found
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {rows.map(r => (
          <Fragment key={r.label}>
            <dt className="font-bold text-white whitespace-nowrap">{r.label}</dt>
            <dd className="text-white">{r.value}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  )
}
