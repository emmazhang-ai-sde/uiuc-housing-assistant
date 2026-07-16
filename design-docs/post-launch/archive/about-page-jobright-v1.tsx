"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import AppHeader from "@/components/AppHeader"
import { fetchStatus, DataStatus } from "@/lib/api"
import { COMPANIES } from "@/lib/companies"
import { inter } from "@/lib/fonts"

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
              <span className="w-1.5 h-1.5 rounded-full bg-mint-400 shrink-0 mt-1.5" />
              <span>{q}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2.5">
          Browse and compare listings directly with{" "}
          <Link href="/card" className="font-semibold text-ink-900 underline decoration-mint-400 decoration-2 underline-offset-2">Card view</Link>{" "}
          or <Link href="/map" className="font-semibold text-ink-900 underline decoration-mint-400 decoration-2 underline-offset-2">Map view</Link>.
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
              <span className="w-1.5 h-1.5 rounded-full bg-mint-400 shrink-0 mt-1.5" />
              <span>{q}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2.5">
          Use{" "}
          <Link href="/chat" className="font-semibold text-ink-900 underline decoration-mint-400 decoration-2 underline-offset-2">Chat</Link>{" "}
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

function SectionHeading({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="text-center mb-10">
      <div className="text-[11px] font-bold uppercase tracking-widest text-mint-600 mb-2">{kicker}</div>
      <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink-900">{title}</h2>
    </div>
  )
}

export default function AboutPage() {
  const [status, setStatus] = useState<DataStatus | null>(null)

  useEffect(() => {
    fetchStatus().then(setStatus).catch(() => {})
  }, [])

  const stats =
    status?.listing_count != null && status?.property_count != null
      ? [
          { value: status.listing_count.toLocaleString(), label: "floor plans" },
          { value: status.property_count.toLocaleString(), label: "properties" },
          { value: String(COMPANIES.length), label: "companies" },
        ]
      : null

  return (
    <div className={`${inter.className} min-h-screen bg-white text-ink-900`}>
      <div className="sticky top-0 z-30 bg-white">
        <AppHeader />
      </div>

      {/* Hero */}
      <section className="px-6 pt-20 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-mist-50 border border-mist-100 text-[11px] font-bold uppercase tracking-widest text-neutral-500 mb-7">
          <span className="w-2 h-2 rounded-full bg-mint-400" />
          Built only for UIUC students
        </div>
        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight leading-[1.12] max-w-3xl mx-auto">
          Apartment hunting near UIUC,<br />
          <span className="bg-[linear-gradient(266deg,#ACFFE1,#CFFFC4)] rounded-xl px-3 box-decoration-clone">
            without the tab-hopping.
          </span>
        </h1>
        <p className="text-neutral-500 text-base sm:text-lg max-w-xl mx-auto mt-7 leading-relaxed">
          One place to search every UIUC-area leasing company by price, beds, location, and availability,
          in plain English.
        </p>
        <div className="flex items-center justify-center gap-3 mt-9">
          <Link
            href="/chat"
            className="px-6 py-3 rounded-full bg-mint-400 text-ink-900 text-sm font-bold hover:bg-[#00D68F] transition-colors"
          >
            Start chatting
          </Link>
          <Link
            href="/map"
            className="px-6 py-3 rounded-full bg-white border border-neutral-200 text-ink-900 text-sm font-bold hover:border-neutral-400 transition-colors"
          >
            Browse the map
          </Link>
        </div>
        {stats && (
          <div className="flex items-center justify-center gap-10 sm:gap-16 mt-14">
            {stats.map(({ value, label }) => (
              <div key={label}>
                <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-ink-900">{value}</div>
                <div className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mt-1">{label}</div>
              </div>
            ))}
          </div>
        )}
        <img
          src="/logos/project-picture.png"
          alt="Illustration of a UIUC campus building"
          className="w-full max-w-3xl mx-auto mt-14 rounded-3xl border border-mist-100 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.15)]"
        />
      </section>

      {/* What you can do here */}
      <section className="px-6 py-16 bg-mist-50">
        <div className="max-w-5xl mx-auto">
          <SectionHeading kicker="Two ways to search" title="What you can do here" />
          <div className="grid sm:grid-cols-2 gap-4">
            {SCENARIOS.map(({ emoji, title, body }) => (
              <div
                key={title}
                className="p-7 bg-white rounded-2xl border border-mist-100 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.04)] text-left"
              >
                <div className="w-11 h-11 flex items-center justify-center text-xl mb-4 rounded-xl bg-mist-50 border border-mist-100">{emoji}</div>
                <div className="font-bold text-ink-900 mb-2">{title}</div>
                <div className="text-sm text-neutral-500 leading-relaxed">{body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Advantages */}
      <section className="px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <SectionHeading kicker="Advantages" title="Why it's better" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-8">
            {ADVANTAGES.map(({ title, description }) => (
              <div key={title}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-5 h-5 rounded-full bg-[#28C86E1A] text-mint-600 flex items-center justify-center text-[11px] font-bold shrink-0">✓</span>
                  <span className="font-bold text-ink-900">{title}</span>
                </div>
                <p className="text-sm text-neutral-500 leading-relaxed pl-7">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pain points solved */}
      <section className="px-6 py-20 bg-mist-50">
        <div className="max-w-3xl mx-auto">
          <SectionHeading kicker="Before vs now" title="Built for the way UIUC students actually search" />
          <div className="bg-white rounded-2xl border border-mist-100 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.04)] overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-mist-100">
                  <th className="text-left text-xs font-bold uppercase tracking-widest text-neutral-400 px-5 py-3.5 w-1/2">
                    Before
                  </th>
                  <th className="text-left text-xs font-bold uppercase tracking-widest text-mint-600 px-5 py-3.5 w-1/2">
                    Now
                  </th>
                </tr>
              </thead>
              <tbody>
                {PAIN_POINTS.map(({ problem, solution }) => (
                  <tr key={problem} className="border-b border-mist-100 last:border-b-0">
                    <td className="text-sm font-medium text-ink-900 leading-relaxed px-5 py-4 align-top">
                      {problem}
                    </td>
                    <td className="text-sm font-semibold text-mint-600 leading-relaxed px-5 py-4 align-top">
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
      <section className="px-6 py-20">
        <div className="max-w-5xl mx-auto rounded-[32px] bg-[linear-gradient(266deg,#ACFFE1,#CFFFC4)] px-8 py-16 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-ink-900">Ready to find your place?</h2>
          <p className="text-sm text-ink-900/70 font-medium mt-3">
            Search every UIUC-area leasing company in one place.
          </p>
          <Link
            href="/card"
            className="inline-block px-7 py-3 rounded-full bg-ink-900 text-white text-sm font-bold hover:bg-black transition-colors mt-8"
          >
            Get started
          </Link>
        </div>
      </section>
    </div>
  )
}
