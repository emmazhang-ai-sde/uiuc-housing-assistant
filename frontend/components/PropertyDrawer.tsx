"use client"

import { useEffect } from "react"
import { Listing } from "@/lib/api"
import { COMPANY_LOGOS } from "@/lib/companies"
import { availabilityStatus, bedsLabel, splitAvailabilityLines } from "@/lib/availability"

function priceStr(low: number | null | undefined, high: number | null | undefined): string {
  if (low == null) return "—"
  if (high == null || low === high) return `$${low.toLocaleString()}`
  return `$${low.toLocaleString()}–$${high?.toLocaleString()}`
}

const STATUS_BADGE_STYLE = {
  now:         "bg-now-100 text-neutral-900",
  available:   "bg-[#C7DDB5] text-neutral-900",
  unavailable: "bg-neutral-100 text-black",
} as const

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2">
      {children}
    </div>
  )
}

export default function PropertyDrawer({
  listing,
  onClose,
}: {
  listing: Listing | null
  onClose: () => void
}) {
  useEffect(() => {
    if (!listing) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [listing, onClose])

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = listing ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [listing])

  const isOpen = listing !== null

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed right-0 top-0 h-full w-full max-w-[480px] z-50 bg-white shadow-2xl overflow-y-auto transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {listing && <DrawerContent listing={listing} onClose={onClose} />}
      </div>
    </>
  )
}

// Exported so a docked (non-modal) panel — e.g. the Chat page's right-hand
// detail column — can render the exact same content without the slide-in/backdrop.
export function DrawerContent({ listing, onClose }: { listing: Listing; onClose: () => void }) {
  const priceBed   = priceStr(listing.price_per_bed_low, listing.price_per_bed_high)
  const priceTotal = priceStr(
    listing.price_total_low  ?? listing.price_per_bed_low,
    listing.price_total_high ?? listing.price_per_bed_high,
  )
  const isSingleOccupancy = listing.beds <= 1
  const bedsLabelStr = bedsLabel(listing.beds, listing.unit_type)
  const badgeStyle   = STATUS_BADGE_STYLE[availabilityStatus(listing.availability)]
  const availLines   = splitAvailabilityLines(listing.availability)

  const amenityList = listing.amenities
    ? listing.amenities.split(",").map(a => a.trim()).filter(Boolean)
    : []

  const hasLeaseInfo = !!(listing.lease_dates || listing.utility_fees)

  return (
    <div className="flex flex-col min-h-full">

      {/* Close button */}
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/25 text-white text-sm hover:bg-black/45 transition-colors"
      >
        ✕
      </button>

      {/* Photo */}
      <div className="h-52 shrink-0 bg-neutral-100">
        {listing.photo_url && (
          <img src={listing.photo_url} alt="" className="w-full h-full object-cover" />
        )}
      </div>

      {/* Content */}
      <div className="p-6 flex flex-col gap-5 flex-1">

        {/* Company logo + availability badge */}
        <div className="flex items-start justify-between gap-3">
          {COMPANY_LOGOS[listing.company]
            ? <img src={COMPANY_LOGOS[listing.company]} alt={listing.company} className="h-3.5 object-contain object-left mt-0.5" />
            : <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">{listing.company}</div>
          }
          <span className={`inline-block shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${badgeStyle}`}>
            {availLines.map((p, i) => <span key={i} className="block text-center">{p}</span>)}
          </span>
        </div>

        {/* Address */}
        <h2 className="text-lg font-bold text-neutral-900 leading-snug -mt-1">
          {listing.address}
        </h2>

        {/* Tagline */}
        {listing.tagline && (
          <p className="text-sm font-semibold text-[#8A9E7E] -mt-2">{listing.tagline}</p>
        )}

        {/* Unit type + area */}
        <div className="text-sm text-neutral-500">
          {listing.unit_type}{bedsLabelStr ? ` · ${bedsLabelStr}` : ""}
          {listing.area ? ` · ${listing.area}` : ""}
        </div>

        {/* Price */}
        <div className="flex gap-6 -mt-1">
          {!isSingleOccupancy && (
            <div>
              <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-0.5">Per bed</div>
              <div className="text-xl font-bold text-neutral-900">{priceBed}<span className="text-sm font-medium text-neutral-400">/mo</span></div>
            </div>
          )}
          <div>
            <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-0.5">Total</div>
            <div className="text-xl font-bold text-neutral-900">{priceTotal}<span className="text-sm font-medium text-neutral-400">/mo</span></div>
          </div>
        </div>

        {/* Availability summary (UG only) */}
        {listing.availability_summary && (
          <p className="text-sm text-neutral-500 -mt-2">{listing.availability_summary}</p>
        )}

        <div className="border-t border-neutral-100" />

        {/* Description */}
        {listing.description && (
          <div>
            <SectionLabel>About</SectionLabel>
            <p className="text-sm text-neutral-600 leading-relaxed whitespace-pre-line">
              {listing.description}
            </p>
          </div>
        )}

        {/* Amenities */}
        {amenityList.length > 0 && (
          <div>
            <SectionLabel>Amenities</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {amenityList.map(a => (
                <span
                  key={a}
                  className="px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-600 text-xs font-medium"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Lease info */}
        {hasLeaseInfo && (
          <div>
            <SectionLabel>Lease Info</SectionLabel>
            <div className="flex flex-col gap-1">
              {listing.lease_dates && (
                <div className="text-sm text-neutral-600">
                  <span className="font-medium text-neutral-700">Lease dates: </span>
                  {listing.lease_dates}
                </div>
              )}
              {listing.utility_fees && (
                <div className="text-sm text-neutral-600">
                  <span className="font-medium text-neutral-700">Utility fee: </span>
                  {listing.utility_fees}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-auto pt-2">
          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center text-sm font-bold text-white bg-neutral-900 hover:bg-neutral-700 px-4 py-2.5 rounded-full transition-colors"
          >
            View Listing →
          </a>
          {listing.brochure_url && (
            <a
              href={listing.brochure_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-bold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 px-4 py-2.5 rounded-full transition-colors"
            >
              Brochure PDF
            </a>
          )}
        </div>

      </div>
    </div>
  )
}
