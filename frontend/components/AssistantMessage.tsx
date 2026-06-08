import ListingCard from "./ListingCard"
import SummaryTable from "./SummaryTable"
import { Listing } from "@/lib/api"

export default function AssistantMessage({
  answer,
  listings,
}: {
  answer: string
  listings: Listing[]
}) {
  return (
    <div className="flex items-start gap-3 my-4">
      <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center shrink-0 text-sm mt-1">
        🏠
      </div>
      <div className="flex-1 space-y-4">
        {/* LLM answer text */}
        <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm text-[15px] leading-relaxed text-slate-700">
          {answer}
        </div>

        {/* Listing cards grid */}
        {listings.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {listings.map((l, i) => <ListingCard key={i} listing={l} />)}
          </div>
        )}

        {/* Summary table */}
        {listings.length > 0 && <SummaryTable listings={listings} />}
      </div>
    </div>
  )
}
