import { Listing } from "@/lib/api"

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
      : status === "Leased".toLowerCase()
      ? "bg-red-100 text-red-700"
      : "bg-slate-100 text-slate-600"
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase whitespace-nowrap ${style}`}>
      {availability}
    </span>
  )
}

export default function ListingCard({ listing }: { listing: Listing }) {
  const priceBed = priceStr(listing.price_per_bed_low, listing.price_per_bed_high)
  const priceTotal = priceStr(listing.price_total_low ?? listing.price_per_bed_low, listing.price_total_high ?? listing.price_per_bed_high)
  const bedsLabel = listing.beds ? `${listing.beds} bed` : ""

  return (
    <article className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow group">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 mr-2">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">{listing.company}</div>
          <h3 className="font-bold text-slate-900 text-sm leading-tight">{listing.address}</h3>
        </div>
        <AvailabilityBadge availability={listing.availability} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <span className="text-lg leading-none">🛏️</span>
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Layout</div>
            <div className="text-sm font-semibold text-slate-700">{listing.unit_type} · {bedsLabel}</div>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <span className="text-lg leading-none">💰</span>
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Rent</div>
            <div className="text-sm font-semibold text-slate-700">
              {priceBed}/bed <span className="text-slate-400 font-normal">({priceTotal} total)</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-50">
        <a
          href={listing.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 group-hover:gap-2 transition-all"
        >
          View Listing →
        </a>
      </div>
    </article>
  )
}
