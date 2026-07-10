import { Listing, Filters } from "@/lib/api"
import { COMPANY_LOGOS } from "@/lib/companies"
import { availabilityStatus, bedsLabel, splitAvailabilityLines } from "@/lib/availability"

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

function splitAddressLines(address: string): string[] {
  const [first, ...rest] = address.split(/\s+([-–])\s+/)
  if (!rest.length) return [address]

  const lines = [first.trim()]
  for (let i = 0; i < rest.length; i += 2) {
    const dash = rest[i]
    const text = rest[i + 1]?.trim()
    if (text) lines.push(`${dash} ${text}`)
  }
  return lines
}

const STATUS_BADGE_STYLE = {
  now:         "bg-now-100 text-neutral-900",
  available:   "bg-[#C7DDB5] text-neutral-900",
  unavailable: "bg-neutral-100 text-black",
} as const

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

export default function ListingCard({
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
  const addressLines = splitAddressLines(addressMain)

  return (
    <article
      onClick={() => onSelect?.(listing)}
      className={`relative bg-white rounded-3xl shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] hover:shadow-[0_12px_28px_-8px_rgba(0,0,0,0.14)] transition-shadow group flex flex-col overflow-hidden ${onSelect ? "cursor-pointer" : ""}`}
    >

      {/* Availability badge — absolute over photo (or card top if no photo) */}
      <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-1">
        <AvailabilityBadge availability={listing.availability} />
        {walkMins != null && (
          <span className="inline-block text-[10px] font-bold px-2.5 py-1 rounded-full uppercase bg-white/90 text-neutral-600 shadow-sm">
            ~{walkMins} min walk
          </span>
        )}
        {driveMins != null && (
          <span className="inline-block text-[10px] font-bold px-2.5 py-1 rounded-full uppercase bg-white/90 text-neutral-600 shadow-sm">
            ~{driveMins} min drive
          </span>
        )}
      </div>

      {/* Exterior photo — always rendered; blank placeholder when no photo_url */}
      <div className="relative h-36 shrink-0 bg-neutral-100">
        {listing.photo_url && (
          <img src={listing.photo_url} alt="" className="w-full h-full object-cover" />
        )}
        {isUnavailable && (
          <div className="absolute inset-0 bg-white/60" />
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Company logo */}
        {COMPANY_LOGOS[listing.company]
          ? <img src={COMPANY_LOGOS[listing.company]} alt={listing.company} className="h-3.5 object-contain object-left" />
          : <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">{listing.company}</div>
        }

        {/* Address — pr leaves room for the badge when there is no photo */}
        <h3 className="font-bold text-neutral-900 text-sm leading-snug pr-16">
          {addressLines.map((line, i) => (
            <span key={i} className="block">{line}</span>
          ))}
          {addressCode && <span className="block text-neutral-900 font-medium text-xs mt-0.5">{addressCode}</span>}
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
              <span key={i} className="text-[11px] font-medium text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-full">
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
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xl font-bold text-neutral-900 tracking-tight">
                  {isSingleOccupancy
                    ? <>{priceTotal}<span className="text-sm text-neutral-400 font-medium">/mo</span></>
                    : <>{priceBed}<span className="text-sm text-neutral-400 font-medium">/bed</span></>
                  }
                  {overBudget && (
                    <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-semibold bg-[#F5BBA0] text-black">
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
              className={`inline-flex items-center gap-1 text-xs font-bold text-neutral-900 bg-neutral-100 hover:bg-black hover:text-white px-3 py-1.5 rounded-full transition-colors shrink-0 ${listing.price_note ? "self-end" : ""}`}
            >
              View Listing →
            </a>
          </div>
        </div>
      </div>
    </article>
  )
}
