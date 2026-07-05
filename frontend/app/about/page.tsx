"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import AppHeader from "@/components/AppHeader"
import { fetchStatus, DataStatus } from "@/lib/api"
import { COMPANIES } from "@/lib/companies"

const SCENARIOS = [
  {
    emoji: "🎯",
    title: "Know exactly what you want?",
    body: (
      <>
        If you already have clear filter conditions in mind, like:
        <ul className="mt-2.5 space-y-1.5">
          {[
            "How many beds",
            "Your budget",
            "Best move-in date",
          ].map(q => (
            <li key={q} className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 shrink-0 mt-1.5" />
              <span>{q}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2.5">
          Browse and compare listings directly with{" "}
          <Link href="/card" className="font-semibold text-neutral-900 underline underline-offset-2">Card view</Link>,{" "}
          <Link href="/map" className="font-semibold text-neutral-900 underline underline-offset-2">Map view</Link>, or{" "}
          <span className="font-semibold text-neutral-900">Table view</span>.
        </p>
      </>
    ),
  },
  {
    emoji: "💬",
    title: "Not sure yet?",
    body: (
      <>
        If you don&rsquo;t have a clear idea yet, or have general questions like:
        <ul className="mt-2.5 space-y-1.5">
          {[
            "When should I start apartment hunting?",
            "Is it too late to find a place?",
            "What's the average price near campus?",
          ].map(q => (
            <li key={q} className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 shrink-0 mt-1.5" />
              <span>{q}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2.5">
          Use{" "}
          <Link href="/chat" className="font-semibold text-neutral-900 underline underline-offset-2">Chat</Link>{" "}
          to talk it through with the AI and explore your preferences.
        </p>
      </>
    ),
  },
]

const ADVANTAGES = [
  {
    title: "One search, every company",
    description: "Green Street Realty, Universities Group, and more, searched together instead of tab by tab.",
  },
  {
    title: "Price per bed, always",
    description: (
      <>
        A &ldquo;starting at&rdquo; price is often for the{" "}
        <span className="font-semibold text-neutral-800">cheapest unit type</span>, not the one you want,
        which can{" "}
        <span className="font-semibold text-neutral-800">cost twice as much per bed</span>. Every result
        shows the{" "}
        <span className="font-semibold text-neutral-800">real price per bed for that exact unit</span>.
      </>
    ),
  },
  {
    title: "Plain-English search",
    description: "Type what you actually want, like \"2BR under $900/bed near Grainger\", no dropdown forms to fight.",
  },
  {
    title: "Live availability",
    description: (
      <>
        Listings are{" "}
        <span className="font-semibold text-neutral-800">kept up to date</span>, so you won&rsquo;t find your
        favorite unit{" "}
        <span className="font-semibold text-neutral-800">already leased</span>{" "}
        on the property&rsquo;s own site.
      </>
    ),
  },
  {
    title: "See it on a map",
    description: "Every listing plotted relative to campus, so distance is something you see, not something you guess.",
  },
  {
    title: "Free, no spam",
    description: (
      <>
        No login walls, no forms handed to leasing offices, no follow-up calls. Built{" "}
        <span className="font-semibold text-neutral-800">only for UIUC students</span>.
      </>
    ),
  },
]

const PAIN_POINTS = [
  {
    problem: "12 tabs open, one per landlord site, and still no way to compare them side by side.",
    solution: "One search covers all of them, in one place.",
  },
  {
    problem: "The price you see is for the whole unit, not what actually hits your card each month.",
    solution: "Every result is normalized to price per bed, so comparisons are honest.",
  },
  {
    problem: "You email, wait two days for a reply, and the unit's already leased by the time they answer.",
    solution: "Live availability windows are built into every search and filter.",
  },
  {
    problem: "Google Maps says 0.4 miles, but nobody warns you it's a 20-minute walk in January.",
    solution: "The map view shows every listing relative to campus buildings.",
  },
  {
    problem: "Every follow-up question means another call to an office that's already closed for the day.",
    solution: "Ask in plain English and get an instant, specific answer.",
  },
]

export default function AboutPage() {
  const [status, setStatus] = useState<DataStatus | null>(null)

  useEffect(() => {
    fetchStatus().then(setStatus).catch(() => {})
  }, [])

  const statLine =
    status?.listing_count != null && status?.property_count != null
      ? `${status.listing_count} floor plans · ${status.property_count} properties · ${COMPANIES.length} companies`
      : null

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-30 bg-white">
        <AppHeader />
      </div>

      {/* Hero */}
      <section className="px-6 pt-24 pb-20 text-center">
        <h1 className="text-5xl sm:text-6xl font-bold text-neutral-900 tracking-tight leading-[1.15] max-w-3xl mx-auto">
          Apartment hunting near UIUC,<br />without the tab-hopping.
        </h1>
        <p className="text-neutral-500 text-base sm:text-lg max-w-xl mx-auto mt-6 leading-relaxed">
          One place to search every UIUC-area leasing company by price, beds, location, and availability,
          in plain English.
        </p>
        {statLine && (
          <p className="text-xs uppercase tracking-widest font-medium text-neutral-400 mt-6">
            {statLine}
          </p>
        )}
        <div className="flex items-center justify-center gap-3 mt-9">
          <Link
            href="/chat"
            className="px-6 py-2.5 rounded-full bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-800 transition-colors"
          >
            Start chatting
          </Link>
          <Link
            href="/map"
            className="px-6 py-2.5 rounded-full bg-neutral-100 text-neutral-900 text-sm font-semibold hover:bg-neutral-200 transition-colors"
          >
            Browse the map
          </Link>
        </div>
        <img
          src="/logos/project-picture.png"
          alt="Illustration of a UIUC campus building"
          className="w-full max-w-3xl mx-auto mt-14 rounded-3xl shadow-[0_8px_30px_-12px_rgba(0,0,0,0.15)]"
        />
      </section>

      {/* What you can do here */}
      <section className="px-6 py-16 bg-neutral-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 text-center mb-10">
            What you can do here
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {SCENARIOS.map(({ emoji, title, body }) => (
              <div
                key={title}
                className="p-7 bg-white rounded-3xl shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)]"
              >
                <div className="w-10 h-10 flex items-center justify-center text-xl mb-4">{emoji}</div>
                <div className="font-semibold text-neutral-900 mb-2">{title}</div>
                <div className="text-sm text-neutral-500 leading-relaxed">{body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Advantages */}
      <section className="px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 text-center mb-10">
            Why it&rsquo;s better
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-8">
            {ADVANTAGES.map(({ title, description }) => (
              <div key={title}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-glow-600 shrink-0" />
                  <span className="font-semibold text-neutral-900">{title}</span>
                </div>
                <p className="text-sm text-neutral-500 leading-relaxed pl-3.5">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pain points solved */}
      <section className="px-6 py-20 bg-neutral-50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 text-center mb-10">
            Built for the way UIUC students actually search
          </h2>
          <div className="bg-white rounded-2xl shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)] overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-neutral-100">
                  <th className="text-left text-xs font-bold uppercase tracking-widest text-neutral-400 px-5 py-3.5 w-1/2">
                    Before
                  </th>
                  <th className="text-left text-xs font-bold uppercase tracking-widest text-neutral-400 px-5 py-3.5 w-1/2">
                    Now
                  </th>
                </tr>
              </thead>
              <tbody>
                {PAIN_POINTS.map(({ problem, solution }) => (
                  <tr key={problem} className="border-b border-neutral-100 last:border-b-0">
                    <td className="text-sm font-medium text-neutral-900 leading-relaxed px-5 py-4 align-top">
                      {problem}
                    </td>
                    <td className="text-sm font-medium leading-relaxed px-5 py-4 align-top" style={{ color: "#2d8a4e" }}>
                      {solution}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA footer */}
      <section className="px-6 py-24 text-center">
        <h2 className="text-3xl font-bold text-neutral-900 tracking-tight">Ready to find your place?</h2>
        <div className="flex items-center justify-center gap-3 mt-8">
          <Link
            href="/card"
            className="px-6 py-2.5 rounded-full bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-800 transition-colors"
          >
            Get started
          </Link>
        </div>
      </section>
    </div>
  )
}
