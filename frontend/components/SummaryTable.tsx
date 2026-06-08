import { Listing } from "@/lib/api"

function priceStr(low: number | null, high: number | null): string {
  if (low === null) return "—"
  if (low === high) return `$${low.toLocaleString()}`
  return `$${low.toLocaleString()}–$${high?.toLocaleString()}`
}

export default function SummaryTable({ listings }: { listings: Listing[] }) {
  if (!listings.length) return null

  const sorted = [...listings].sort((a, b) => a.address.localeCompare(b.address))

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
      <div className="bg-slate-50 px-5 py-3 border-b border-slate-200">
        <h3 className="font-bold text-slate-800 text-sm">Summary</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm text-slate-600">
          <thead>
            <tr className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
              {["Address", "Unit", "Beds", "Price/bed", "Price/mo total", "Availability", "Link"].map(h => (
                <th key={h} className="px-5 py-3 border-b border-slate-200 bg-white whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((l, i) => {
              const prevAddress = i > 0 ? sorted[i - 1].address : null
              const showAddress = l.address !== prevAddress
              const leased = l.availability.toLowerCase() === "leased"

              return (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5 whitespace-nowrap">{showAddress ? l.address : ""}</td>
                  <td className="px-5 py-3.5 italic whitespace-nowrap">{l.unit_type}</td>
                  <td className="px-5 py-3.5">{l.beds}</td>
                  <td className="px-5 py-3.5 font-medium text-slate-900 whitespace-nowrap">
                    {priceStr(l.price_per_bed_low, l.price_per_bed_high)}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    {priceStr(l.price_total_low ?? l.price_per_bed_low, l.price_total_high ?? l.price_per_bed_high)}
                  </td>
                  <td className={`px-5 py-3.5 whitespace-nowrap ${leased ? "text-slate-400" : ""}`}>
                    {l.availability}
                  </td>
                  <td className="px-5 py-3.5">
                    <a href={l.url} target="_blank" rel="noopener noreferrer"
                      className="text-blue-600 font-semibold hover:underline">
                      View →
                    </a>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
