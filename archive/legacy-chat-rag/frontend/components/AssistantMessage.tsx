"use client"

import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import dynamic from "next/dynamic"
import ListingGrid from "./ListingGrid"
import SummaryTable, { tableRowsHtml, tableRowsTsv } from "./SummaryTable"
import SaveButton from "./SaveButton"
import type { MapViewHandle } from "./MapView"
import { Listing, Filters } from "@/lib/api"
import { downloadElementPng, buildExportSlug } from "@/lib/exportDom"
import { LANDMARKS, Landmark } from "@/lib/landmarks"
import { availabilityStatus, availabilitySortValue } from "@/lib/availability"
import { fetchWalkingSeconds, fetchDrivingSeconds } from "@/lib/osrm"
import { useSaveAction } from "@/hooks/useSaveAction"

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
  const cardSave  = useSaveAction()
  const tableSave = useSaveAction()
  const mapSave   = useSaveAction()
  const cardsRef  = useRef<HTMLDivElement>(null)
  const tableRef  = useRef<HTMLDivElement>(null)
  const mapViewRef = useRef<MapViewHandle>(null)
  const [tableCopyStatus, setTableCopyStatus] = useState<"idle" | "copied" | "failed">("idle")

  async function copyTable() {
    try {
      const html = tableRowsHtml(sortedListings.map(r => r.listing))
      const tsv = tableRowsTsv(sortedListings.map(r => r.listing))
      if (navigator.clipboard && "ClipboardItem" in window) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([tsv], { type: "text/plain" }),
          }),
        ])
      } else {
        await navigator.clipboard.writeText(tsv)
      }
      setTableCopyStatus("copied")
    } catch {
      setTableCopyStatus("failed")
    } finally {
      window.setTimeout(() => setTableCopyStatus("idle"), 1600)
    }
  }

  function saveTableImage() {
    if (!tableRef.current) return
    const slug = buildExportSlug(filters)
    tableSave.trigger(() => downloadElementPng(tableRef.current!, `uiuc-housing-table-${slug}.png`))
  }

  function saveMapHtml() {
    if (!mapViewRef.current) return
    mapSave.trigger(() => mapViewRef.current!.saveMapHtml())
  }

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
    <div className="w-fit max-w-3xl bg-white border border-mist-100 rounded-3xl rounded-tl-lg px-5 py-3.5 text-[15px] font-medium leading-relaxed text-ink-900">
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-bold">{children}</strong>,
        }}
      >
        {answer.replace(/\n/g, "\n\n")}
      </ReactMarkdown>
    </div>
  ) : null

  async function saveCardImages() {
    const cardGrid = cardsRef.current
    if (!cardGrid) return

    const cards = Array.from(cardGrid.children) as HTMLElement[]
    const total = cards.length
    const chunks: HTMLElement[][] = []
    for (let i = 0; i < cards.length; i += 9) {
      chunks.push(cards.slice(i, i + 9))
    }

    const slug = buildExportSlug(filters)

    let sortSuffix = ""
    if (sortLandmark) {
      const lmSlug = sortLandmark.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
      sortSuffix = `-walk-${lmSlug}`
    } else if (sortBy === "unit") {
      sortSuffix = `-beds-${sortDir}`
    } else if (sortBy === "price") {
      sortSuffix = `-price-${sortDir}`
    } else if (sortBy === "availability") {
      sortSuffix = `-avail-${sortDir}`
    }

    cardSave.trigger(async () => { for (let i = 0; i < chunks.length; i += 1) {
        const suffix = chunks.length > 1 ? `-${i + 1}of${chunks.length}` : ""
        const filename = `uiuc-housing-cards-${slug}${sortSuffix}${suffix}.png`

        // Outer shell keeps the element in the viewport for html-to-image rendering
        const shell = document.createElement("div")
        shell.style.cssText = "position:fixed;top:0;left:0;z-index:-1;pointer-events:none;"

        // Flex column: cards grid on top, footer bar on bottom
        const exportGrid = document.createElement("div")
        exportGrid.style.width = "1120px"
        exportGrid.style.background = "#f5f5f5"
        exportGrid.style.display = "flex"
        exportGrid.style.flexDirection = "column"

        // Header bar: [unit range (left) | filename (center) | page number (right)]
        const start = i * 9 + 1
        const end = Math.min((i + 1) * 9, total)

        const header = document.createElement("div")
        header.style.cssText = [
          "display:flex",
          "align-items:center",
          "padding:14px 20px 10px",
          "font-size:11px",
          "font-family:sans-serif",
          "color:#737373",
          "border-bottom:1px solid #e5e5e5",
        ].join(";")

        const rangeEl = document.createElement("div")
        rangeEl.textContent = `Showing ${start}–${end} of ${total} units`
        rangeEl.style.flex = "1"

        const nameEl = document.createElement("div")
        nameEl.textContent = filename
        nameEl.style.flex = "1"
        nameEl.style.textAlign = "center"

        const pageEl = document.createElement("div")
        pageEl.textContent = `${i + 1} / ${chunks.length}`
        pageEl.style.flex = "1"
        pageEl.style.textAlign = "right"

        header.appendChild(rangeEl)
        header.appendChild(nameEl)
        header.appendChild(pageEl)
        exportGrid.appendChild(header)

        const cardsContainer = document.createElement("div")
        cardsContainer.style.padding = "12px 16px 16px"
        cardsContainer.style.display = "grid"
        cardsContainer.style.gridTemplateColumns = "repeat(3, 1fr)"
        cardsContainer.style.gap = "12px"

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
          cardsContainer.appendChild(clone)
        })

        exportGrid.appendChild(cardsContainer)

        shell.appendChild(exportGrid)
        document.body.appendChild(shell)
        try {
          await downloadElementPng(exportGrid, filename)
        } finally {
          shell.remove()
        }
      }
    })
  }

  return (
    <div className="flex items-start gap-3 my-4 pr-11">
      <div className="w-8 h-8 bg-white border border-mist-100 rounded-full flex items-center justify-center shrink-0 text-sm mt-1">
        🏠
      </div>
      <div className="flex-1 min-w-0 space-y-4">
        {listings.length === 0 && answerBubble}

        {listings.length > 0 && (
          <>
            <SearchSummary count={listings.length} applied={filtersApplied ?? {}} filters={filters} />

            {/* Sort bar + view controls */}
            <div className="bg-white rounded-2xl border border-mist-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] px-5 py-3 flex flex-col gap-2 text-sm">
              {/* Row 1: Sort pills + view toggle */}
              <div className="flex items-center gap-3">
              <span className="text-neutral-900 text-sm font-normal shrink-0 w-20">Sort</span>
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
                      className={`px-3 py-1 rounded-full text-sm font-normal transition-colors ${
                        active
                          ? "bg-ink-900 text-white"
                          : "bg-mist-100 text-neutral-900 hover:bg-neutral-200"
                      }`}
                    >
                      {label}{arrow}
                    </button>
                  )
                })}
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* View toggle */}
              <div className="flex items-center gap-1 bg-mist-100 rounded-full p-0.5">
                <button
                  onClick={() => setView("cards")}
                  className={`px-3 py-1 rounded-full text-sm font-normal transition-colors ${
                    view === "cards"
                      ? "bg-white text-neutral-900 shadow-[0_1px_4px_rgba(0,0,0,0.08)]"
                      : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  Cards
                </button>
                <button
                  onClick={() => setView("table")}
                  className={`px-3 py-1 rounded-full text-sm font-normal transition-colors ${
                    view === "table"
                      ? "bg-white text-neutral-900 shadow-[0_1px_4px_rgba(0,0,0,0.08)]"
                      : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  Table
                </button>
                <button
                  onClick={() => setView("map")}
                  className={`px-3 py-1 rounded-full text-sm font-normal transition-colors ${
                    view === "map"
                      ? "bg-white text-neutral-900 shadow-[0_1px_4px_rgba(0,0,0,0.08)]"
                      : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  Map
                </button>
              </div>
              </div>

              {/* Row 2: Distance + action buttons */}
              <div className="flex items-center gap-3">
                <span className="text-neutral-900 text-sm font-normal shrink-0 w-20">Distance</span>
                <select
                  value={sortLandmark?.name ?? ""}
                  onChange={e => {
                    const lm = LANDMARKS.find(l => l.name === e.target.value) ?? null
                    setSortLandmark(lm)
                    if (lm) setSortBy("default")
                  }}
                  className="text-sm rounded-full border border-mist-100 bg-mist-100 px-3 py-1 text-neutral-700 focus:outline-none focus:ring-1 focus:ring-mint-400"
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
                <div className="flex-1" />
                {view === "cards" && (
                  <SaveButton status={cardSave.status} onClick={saveCardImages} label="Save cards PNG" savingLabel="Saving cards" />
                )}
                {view === "table" && (
                  <>
                    <button
                      onClick={copyTable}
                      className="rounded-full bg-mist-100 px-3 py-1 text-sm font-normal text-neutral-700 transition-colors hover:bg-neutral-200"
                    >
                      {tableCopyStatus === "copied" ? "Copied" : tableCopyStatus === "failed" ? "Copy failed" : "Copy table"}
                    </button>
                    <SaveButton status={tableSave.status} onClick={saveTableImage} label="Save table PNG" savingLabel="Saving" />
                  </>
                )}
                {view === "map" && (
                  <SaveButton status={mapSave.status} onClick={saveMapHtml} label="Save map HTML" />
                )}
              </div>
            </div>

            {/* Cards view */}
            {view === "cards" && (
              <ListingGrid
                ref={cardsRef}
                entries={sortedListings}
                maxPricePerBed={maxPricePerBed}
                filters={filters}
                columns={3}
                onSelect={onSelect}
              />
            )}

            {/* Table view */}
            {view === "table" && (
              <SummaryTable ref={tableRef} listings={sortedListings} maxPricePerBed={maxPricePerBed} filters={filters} />
            )}

            {/* Map view */}
            {view === "map" && <MapView ref={mapViewRef} listings={listings} filters={filters} walkMinsByUrl={walkMinsByUrl} />}
          </>
        )}
      </div>
    </div>
  )
}

function SearchSummary({
  count,
  applied,
  filters,
}: {
  count: number
  applied: Record<string, unknown>
  filters: Filters
}) {
  // Prefer the filters actually applied to this search (NL-extracted + panel +
  // the available-only default); fall back to the FilterPanel snapshot otherwise.
  const beds         = (applied.beds ?? filters.beds) as number | number[] | null
  const minPpb       = applied.min_price_per_bed as number | undefined
  const maxPpb       = (applied.max_price_per_bed ?? filters.max_price_per_bed) as number | null | undefined
  const availWindow  = (applied.availability_window ?? filters.availability_window) as string | null | undefined
  const availableOnly = applied.available_only === true
  const propertyType = (applied.property_type ?? filters.property_type) as string | null | undefined
  const company      = (applied.company ?? filters.company) as string | null | undefined
  const bufferType   = (applied.buffer_type ?? filters.buffer_type) as string | null | undefined
  const bufferValue  = (applied.buffer_value ?? filters.buffer_value) as number | null | undefined

  function formatBeds(): string {
    if (beds == null) return "Any"
    const arr = Array.isArray(beds) ? beds : [beds]
    if (arr.length === 0) return "Any"
    const sorted = [...arr].sort((a, b) => a - b)
    const labels = sorted.map(b => (b === 0 ? "Studio" : b >= 5 ? "5+" : `${b}`))
    return labels.join(", ") + (sorted.every(b => b === 0) ? "" : sorted[0] > 0 ? " bed" : "")
  }

  function formatBudget(): string {
    if (minPpb && maxPpb) return `$${minPpb.toLocaleString()}–$${maxPpb.toLocaleString()}/bed`
    if (minPpb && !maxPpb) return `≥ $${minPpb.toLocaleString()}/bed`
    if (!maxPpb) return "No limit"
    const base = `≤ $${maxPpb.toLocaleString()}/bed`
    if (bufferType === "exact") return `${base} (exact)`
    if (bufferType === "percent" && bufferValue) return `${base}  +${bufferValue}%`
    if (bufferType === "fixed" && bufferValue) return `${base}  +$${bufferValue}`
    return base
  }

  const WINDOW_LABELS: Record<string, string> = {
    now: "Available Now",
    june_2026: "Jun '26",
    july_2026: "Jul '26",
    august_2026: "Aug '26",
    leased: "Leased",
  }

  const availabilityValue = availWindow
    ? WINDOW_LABELS[availWindow] ?? availWindow
    : availableOnly
    ? "Available only"
    : null

  const rows: { label: string; value: string }[] = [
    ...(propertyType ? [{ label: "Type", value: propertyType }] : []),
    { label: "Bedroom",  value: formatBeds() },
    { label: "Budget",   value: formatBudget() },
    ...(availabilityValue ? [{ label: "Availability", value: availabilityValue }] : []),
    { label: "Source", value: company ?? "All" },
  ]

  return (
    <div className="w-fit max-w-3xl rounded-3xl rounded-tl-lg bg-[linear-gradient(266deg,#ACFFE1,#CFFFC4)] px-5 py-3.5 text-sm leading-relaxed text-ink-900">
      <div className="font-bold text-ink-900 underline">
        {count} unit{count !== 1 ? "s" : ""} found
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {rows.map(r => (
          <Fragment key={r.label}>
            <dt className="font-bold text-ink-900 whitespace-nowrap">{r.label}</dt>
            <dd className="text-ink-900">{r.value}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  )
}
