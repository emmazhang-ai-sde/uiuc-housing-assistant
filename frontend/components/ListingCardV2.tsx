import { Listing, Filters } from "@/lib/api"
import { COMPANY_LOGOS } from "@/lib/companies"
import { availabilityStatus, bedsLabel, splitAvailabilityLines } from "@/lib/availability"
import ListingPhoto from "@/components/ListingPhoto"
import { heroDisplay } from "@/lib/fonts"

// Same props and behavior as the original ListingCard; this is the current
// card skin used by the browse grid.

function priceStr(low: number | null | undefined, high: number | null | undefined): string {
  if (low == null) return "—"
  if (high == null || low === high) return `$${low.toLocaleString()}`
  return `$${low.toLocaleString()}–$${high?.toLocaleString()}`
}

function splitAddress(address: string): { main: string; code: string | null } {
  const match = address.match(/^(.*),\s*([A-Z]{2}\s?\d{5})$/)
  if (!match) return { main: address, code: null }
  return { main: match[1], code: match[2] }
}

const STATUS_BADGE_STYLE = {
  now:         "bg-forest-green text-warm-ivory",
  available:   "bg-blush-pink text-ink-900",
  unavailable: "bg-mist-100 text-ink-900/55",
} as const

const TAG_CHIP_STYLE = [
  "bg-forest-green/10 text-forest-green",
  "bg-blush-pink text-ink-900",
  "bg-mist-100 text-ink-900/70",
]

function AvailabilityBadge({ availability }: { availability: string }) {
  const style = STATUS_BADGE_STYLE[availabilityStatus(availability)]
  const parts = splitAvailabilityLines(availability)
  return (
    <span className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${style}`}>
      {parts.map((p, i) => (
        <span key={i} className="block">{p}</span>
      ))}
    </span>
  )
}

export default function ListingCardV2({
  listing,
  maxPricePerBed = null,
  walkMins = null,
  driveMins = null,
  filters = null,
  onSelect,
}: {
  listing: Listing
  maxPricePerBed?: number | null
  walkMins?: number | null
  driveMins?: number | null
  filters?: Filters | null
  onSelect?: (listing: Listing) => void
}) {
  const priceBed   = priceStr(listing.price_per_bed_low, listing.price_per_bed_high)
  const priceTotal = priceStr(listing.price_total_low ?? listing.price_per_bed_low, listing.price_total_high ?? listing.price_per_bed_high)
  const bedsLabelStr = bedsLabel(listing.beds, listing.unit_type)

  // Hide a tag when the active filter already pins it to one value for every
  // card on screen — showing it again would just be noise.
  const showBedLabel     = !(filters?.beds && filters.beds.length === 1)
  const showPropertyType = !filters?.property_type
  const layoutParts = [
    listing.unit_type,
    showBedLabel ? bedsLabelStr : "",
    showPropertyType ? listing.property_type : "",
  ].filter(Boolean)
  const isSingleOccupancy = listing.beds <= 1
  const overBudget = maxPricePerBed !== null && listing.price_per_bed_high !== null && listing.price_per_bed_high > maxPricePerBed
  const isUnavailable = availabilityStatus(listing.availability) === "unavailable"
  const { main: addressMain, code: addressCode } = splitAddress(listing.address)

  return (
    <article
      onClick={() => onSelect?.(listing)}
      className={`relative bg-white rounded-2xl border border-mist-100 shadow-[0_2px_10px_-4px_rgba(53,20,11,0.08)] hover:border-forest-green hover:shadow-[0_14px_32px_-18px_rgba(53,20,11,0.32)] transition-all duration-200 group flex flex-col overflow-hidden ${onSelect ? "cursor-pointer" : ""}`}
    >

      {/* Walk/drive badges — absolute over photo (availability moved to the logo row) */}
      {(walkMins != null || driveMins != null) && (
        <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-1">
          {walkMins != null && (
            <span className="inline-block text-[10px] font-bold px-2.5 py-1 rounded-full uppercase bg-warm-ivory/95 text-ink-900 shadow-sm">
              ~{walkMins} min walk
            </span>
          )}
          {driveMins != null && (
            <span className="inline-block text-[10px] font-bold px-2.5 py-1 rounded-full uppercase bg-warm-ivory/95 text-ink-900 shadow-sm">
              ~{driveMins} min drive
            </span>
          )}
        </div>
      )}

      {/* Exterior photo */}
      <div className="relative h-36 shrink-0">
        <ListingPhoto src={listing.photo_url} className="h-full w-full" />
        {isUnavailable && (
          <div className="absolute inset-0 bg-warm-ivory/65" />
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Company logo + availability (right-aligned on the same row) */}
        <div className="flex items-start justify-between gap-2">
          {COMPANY_LOGOS[listing.company]
            ? <img src={COMPANY_LOGOS[listing.company]} alt={listing.company} className="h-3.5 object-contain object-left" />
            : <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">{listing.company}</div>
          }
          <AvailabilityBadge availability={listing.availability} />
        </div>

        {/* Address */}
        <h3 className="font-bold text-ink-900 text-sm leading-snug">
          {addressMain}
          {addressCode && <span className="block text-ink-900 font-medium text-xs mt-0.5">{addressCode}</span>}
        </h3>

        {/* Area tag */}
        {listing.area && (
          <div className="text-[11px] text-neutral-400 font-medium capitalize -mt-1">
            {listing.area}
          </div>
        )}

        <div className="flex flex-col gap-2 mt-auto">
          {/* Layout */}
          <div className="flex flex-wrap items-center gap-1.5">
            {layoutParts.map((part, i) => (
              <span key={i} className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg ${TAG_CHIP_STYLE[i % TAG_CHIP_STYLE.length]}`}>
                {part}
              </span>
            ))}
          </div>

          {/* Rent — emphasized as the key data point, with the CTA alongside it.
              price_note listings have no number to emphasize; the note takes the
              full card width (lead sentence only — cards are narrow; the drawer
              and map popup carry the whole text) and the CTA drops below it. */}
          <div className={listing.price_note ? "flex flex-col gap-1.5" : "flex items-end justify-between gap-2"}>
            {listing.price_note ? (
              <div className="text-xs font-semibold text-neutral-500 leading-snug" title={listing.price_note}>
                {listing.price_note.split(". ")[0]}
              </div>
            ) : (
              <div>
                <div className={`${heroDisplay.className} flex flex-wrap items-center gap-x-2 gap-y-1 text-2xl font-normal leading-none text-ink-900`}>
                  {isSingleOccupancy
                    ? <>{priceTotal}<span className="text-sm text-neutral-400 font-medium">/mo</span></>
                    : <>{priceBed}<span className="text-sm text-neutral-400 font-medium">/bed</span></>
                  }
                  {overBudget && (
                    <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold bg-blush-pink text-ink-900">
                      over budget
                    </span>
                  )}
                </div>
                {!isSingleOccupancy && (
                  <div className="text-xs text-neutral-400 mt-0.5">{priceTotal} total</div>
                )}
              </div>
            )}
            <a
              href={listing.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className={`inline-flex items-center gap-1 text-xs font-bold text-warm-ivory bg-forest-green hover:bg-ink-900 px-3 py-1.5 rounded-full transition-colors shrink-0 ${listing.price_note ? "self-end" : ""}`}
            >
              View Listing →
            </a>
          </div>
        </div>
      </div>
    </article>
  )
}
