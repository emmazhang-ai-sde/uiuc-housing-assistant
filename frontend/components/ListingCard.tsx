import { Listing } from "@/lib/api"

const COMPANY_LOGOS: Record<string, string> = {
  "Green Street Realty": "/logos/company-logo-green-street-realty.png",
  "Universities Group":  "/logos/company-logo-university-group.png",
}

function priceStr(low: number | null, high: number | null): string {
  if (low === null) return "—"
  if (low === high) return `$${low.toLocaleString()}`
  return `$${low.toLocaleString()}–$${high?.toLocaleString()}`
}

function AvailabilityBadge({ availability }: { availability: string }) {
  const status = availability.toLowerCase()
  const style =
    status.includes("available") && !status.includes("not available")
      ? "bg-green-100 text-green-700"
      : status === "leased"
      ? "bg-red-100 text-red-700"
      : "bg-slate-100 text-slate-600"
  const parts = availability.split(/(?<=[,;:!])/).map(p => p.trim()).filter(Boolean)
  return (
    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded uppercase ${style}`}>
      {parts.map((p, i) => (
        <span key={i} className="block">{p}</span>
      ))}
    </span>
  )
}

export default function ListingCard({ listing }: { listing: Listing }) {
  const priceBed   = priceStr(listing.price_per_bed_low, listing.price_per_bed_high)
  const priceTotal = priceStr(listing.price_total_low ?? listing.price_per_bed_low, listing.price_total_high ?? listing.price_per_bed_high)
  const bedsLabel  = listing.beds === 0 ? "Studio" : listing.beds ? `${listing.beds} bed` : ""
  const isSingleOccupancy = listing.beds <= 1

  return (
    <article className="relative bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow group flex flex-col gap-2.5">

      {/* Availability badge — top-right corner */}
      <div className="absolute top-3 right-3">
        <AvailabilityBadge availability={listing.availability} />
      </div>

      {/* Company logo */}
      {COMPANY_LOGOS[listing.company]
        ? <img src={COMPANY_LOGOS[listing.company]} alt={listing.company} className="h-3.5 object-contain object-left" />
        : <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{listing.company}</div>
      }

      {/* Address — pr leaves room for the badge */}
      <h3 className="font-bold text-slate-900 text-sm leading-snug pr-16">{listing.address}</h3>

      <div className="border-t border-slate-100 pt-2 flex flex-col gap-1.5">
        {/* Layout */}
        <div>
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Layout</div>
          <div className="text-xs font-semibold text-slate-700">{listing.unit_type} · {bedsLabel}</div>
        </div>

        {/* Rent */}
        <div>
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Rent</div>
          <div className="text-xs font-semibold text-slate-700">
            {isSingleOccupancy
              ? <>{priceTotal}<span className="text-slate-400 font-normal">/mo</span></>
              : <>{priceBed}<span className="text-slate-400 font-normal">/bed</span><br /><span className="text-slate-400 font-normal text-[10px]">{priceTotal} total</span></>
            }
          </div>
        </div>
      </div>

      {/* Link */}
      <div className="mt-auto pt-2 border-t border-slate-50">
        <a
          href={listing.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 group-hover:gap-1.5 transition-all"
        >
          View Listing →
        </a>
      </div>
    </article>
  )
}
