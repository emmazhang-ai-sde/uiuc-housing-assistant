"use client"

// Sort control for the Card view's browse-all grid (2026-07-20), replacing the
// static "N listings, sorted by beds" caption that sat above it. Ordering is a
// backend concern here: the unfiltered catalog is paginated, so a page holds only
// a slice of the matches and sorting client-side would merely reshuffle the
// visible 24. Selecting an option refetches from page 1.
//
// Styled after FilterChips' Chip so the two rows read as one control surface.

import { useEffect, useRef, useState } from "react"
import { ListingSort } from "@/lib/api"

// Keys must match SORT_ORDERS in backend/main.py. `short` is what the collapsed
// chip shows: the full labels would render as "Sort: Price: low to high", whose
// double colon reads badly and is wide enough to wrap the chip row.
export const SORT_OPTIONS: { key: ListingSort; label: string; short: string }[] = [
  { key: "beds",       label: "Beds",             short: "Beds" },
  { key: "price_asc",  label: "Price: low to high", short: "Price ↑" },
  { key: "price_desc", label: "Price: high to low", short: "Price ↓" },
  { key: "company",    label: "Property manager",   short: "Manager" },
]

export const DEFAULT_SORT: ListingSort = "beds"

export default function SortButton({ value, onChange }: {
  value: ListingSort
  onChange: (sort: ListingSort) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Outside click / Escape closes the menu — same idiom as FilterChips, so the
  // menu doesn't linger while the user scrolls the grid underneath it.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const active = SORT_OPTIONS.find(o => o.key === value) ?? SORT_OPTIONS[0]
  // Off-default sorts get the filter row's dark "this is set" treatment, so the
  // chip tells the same story as an active Beds/Price chip beside it.
  const isSet = value !== DEFAULT_SORT

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-1.5 h-9 pl-4 pr-3 rounded-full border text-xs font-semibold whitespace-nowrap transition-colors shadow-[0_2px_10px_-4px_rgba(0,0,0,0.08)] ${
          isSet
            ? "bg-forest-green text-warm-ivory border-forest-green"
            : open
              ? "bg-warm-ivory text-ink-900 border-forest-green"
              : "bg-warm-ivory/95 backdrop-blur text-ink-900 border-mist-100 hover:border-forest-green"
        }`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 7h16M7 12h10M10 17h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Sort: {active.short}
        <span
          aria-hidden
          className={`text-[9px] leading-none transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▼
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute top-full right-0 mt-2 z-50 min-w-max rounded-2xl border border-mist-100 bg-warm-ivory p-1.5 shadow-[0_8px_30px_-12px_rgba(53,20,11,0.32)]"
        >
          {SORT_OPTIONS.map(o => (
            <button
              key={o.key}
              role="option"
              aria-selected={o.key === value}
              onClick={() => { onChange(o.key); setOpen(false) }}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium transition-colors ${
                o.key === value ? "bg-blush-pink text-ink-900" : "text-ink-900/70 hover:bg-mist-50"
              }`}
            >
              <span className={`text-forest-green ${o.key === value ? "" : "invisible"}`} aria-hidden>✓</span>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
