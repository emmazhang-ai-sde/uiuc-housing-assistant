"use client"

import { Listing } from "@/lib/api"
import { DrawerContent } from "@/components/PropertyDrawer"

// Docked, always-visible counterpart to PropertyDrawer — used where a modal
// overlay would force clicking back and forth (e.g. the Chat page). Reserves
// a fixed-width column so property details "just appear" next to the
// conversation instead of covering it.
//
// Two shells, because the two hosts frame it differently and forcing one shape
// on both would break either page:
//   "docked" — Chat: a flush, full-height column against the right edge.
//   "block"  — Card (2026-07-20): a rounded card that sits inside the centred
//              content row alongside the grid, top-aligned with the first card
//              row, scrolling its own overflow rather than running to the top
//              and bottom of the viewport.
export default function PropertyPanel({
  listing,
  onClose,
  variant = "docked",
}: {
  listing: Listing | null
  onClose: () => void
  variant?: "docked" | "block"
}) {
  // `relative` in both shells: DrawerContent's close button is absolutely
  // positioned and anchors to whichever of these is its nearest positioned
  // ancestor. Dropping it would fling the ✕ to the page corner.
  const shell = variant === "block"
    // Sticky so the details stay put while the grid scrolls past, with a bounded
    // height so long content (amenities lists run dozens of lines) scrolls inside
    // the block instead of stretching it down the page.
    // top-20 matches the host's pt-20, which is what clears the floating header:
    // the block starts level with the first card row and sticks there once the
    // grid scrolls past, rather than sliding under the header pill.
    // Wider and shorter than the docked column: as a block it reads as a card
    // rather than a full-height rail, and 70vh keeps it clear of the viewport
    // bottom so more of its content scrolls internally.
    ? "hidden lg:flex flex-col relative w-[480px] shrink-0 sticky top-20 max-h-[70vh] overflow-y-auto rounded-2xl border border-mist-100 bg-white shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)]"
    : "hidden lg:flex flex-col relative w-[420px] shrink-0 h-full overflow-y-auto border-l border-mist-100 bg-white"

  return (
    <aside className={shell}>
      {listing ? <DrawerContent listing={listing} onClose={onClose} /> : <EmptyState />}
    </aside>
  )
}

// Carries the page's design language rather than reading as a blank box: a
// mint-tinted icon tile, a real headline, and a preview of what the panel will
// hold, so the space says what it is for instead of just sitting empty.
function EmptyState() {
  return (
    <div className="flex h-full min-h-[380px] flex-col items-center justify-center gap-5 px-9 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-mint-400/15 text-mint-600">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M3.5 10.5 12 4l8.5 6.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19v-8.5Z"
            stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"
          />
          <path d="M9.5 20.5v-6h5v6" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        </svg>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-[15px] font-bold text-ink-900">No listing selected</p>
        <p className="max-w-[280px] text-[13px] leading-relaxed text-neutral-500">
          Pick any card to open its full details right here, without leaving the grid.
        </p>
      </div>

      <ul className="flex flex-col gap-2 text-left">
        {["Photos and full address", "Pricing and lease dates", "Amenities and utilities"].map(item => (
          <li key={item} className="flex items-center gap-2.5 text-[13px] text-neutral-500">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mint-400" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
