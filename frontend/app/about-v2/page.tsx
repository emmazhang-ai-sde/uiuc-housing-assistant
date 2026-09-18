"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import AppHeader from "@/components/AppHeader"
import { fetchStatus, DataStatus } from "@/lib/api"
import { COMPANIES } from "@/lib/companies"
import { inter } from "@/lib/fonts"

// About, take two (2026-07-15): structured after jobright.ai/tools/ai-job-assistant
// for comparison against /about (which mirrors jobright.ai/ai-agent). Section
// order here: split hero with floating chips → static logo strip → three
// feature blocks each repeating the same CTA → mid-page stats banner →
// six-benefit grid → pain quotes rail → numbered how-it-works → FAQ accordion
// → footer. Same facts as /about, copy written fresh for this layout.

const CTA_LABEL = "Find My Apartment" // repeated per section, like the tools page does

const BENEFITS = [
  { icon: "🟢", title: "Live availability", body: "Leased units are labeled, not hidden." },
  { icon: "🏷️", title: "Honest per-bed pricing", body: "No teaser starting-at numbers." },
  { icon: "▦", title: "Structured filters", body: "Beds, price, move-in, source, and type in one place." },
  { icon: "🗺️", title: "Distance you can see", body: "Walk and drive times, not guesses." },
  { icon: "🛡️", title: "Free, no spam", body: "No login walls or follow-up calls." },
  { icon: "🎓", title: "UIUC only", body: "Built around campus, for students." },
]

const PAIN_QUOTES = [
  {
    problem: "Twelve tabs open, one per landlord, and still no way to compare them.",
    solution: "One search covers every company at once.",
  },
  {
    problem: "The listed price is for the whole unit, not what you actually pay each month.",
    solution: "Everything is normalized to price per bed.",
  },
  {
    problem: "You email about a unit, wait two days, and it's gone by the time they reply.",
    solution: "Availability windows are live in every search.",
  },
  {
    problem: "Maps says 0.4 miles but never mentions the 20-minute January walk.",
    solution: "Walk and drive times to campus, on every listing.",
  },
  {
    problem: "Every follow-up question is another call to an office that already closed.",
    solution: "Filter the shared dataset once, then compare in cards, table, or map.",
  },
]

const STEPS = [
  {
    n: "01",
    title: "Set the filters",
    body: "Choose beds, budget, move-in date, company, and property type from one shared filter bar.",
  },
  {
    n: "02",
    title: "Compare honest prices",
    body: "Every match shows the real price per bed for that exact unit, side by side.",
  },
  {
    n: "03",
    title: "Check the distance",
    body: "See every option on the map with walk and drive times to campus landmarks.",
  },
  {
    n: "04",
    title: "Go sign the good one",
    body: "Open the listing on the company's own site and reach out before it's gone.",
  },
]

/* ---------- animation helper ---------- */

// Fade-up on first scroll into view; never hides content under reduced motion.
function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          io.disconnect()
        }
      },
      { threshold: 0.15 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0 ${
        shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
      } ${className}`}
    >
      {children}
    </div>
  )
}

/* ---------- product mocks ---------- */

function MockSources() {
  return (
    <div className="bg-white rounded-2xl border border-mist-100 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)] p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-full border border-mist-100 bg-mist-50 px-4 py-2 text-sm text-neutral-500">
        <span aria-hidden>🔍</span> near Grainger, under $900/bed
      </div>
      {COMPANIES.slice(0, 4).map(({ name, logo }) => (
        <div key={name} className="flex items-center justify-between rounded-xl border border-mist-100 px-4 py-2.5">
          <img src={logo} alt={name} className="h-4 object-contain object-left" />
          <span className="w-5 h-5 rounded-full bg-[#28C86E1A] text-mint-600 flex items-center justify-center text-[11px] font-bold">✓</span>
        </div>
      ))}
      <span className="self-center text-[11px] font-bold uppercase tracking-widest text-neutral-400">
        + {Math.max(COMPANIES.length - 4, 0)} more, one result list
      </span>
    </div>
  )
}

function MockListingCard() {
  return (
    <div className="bg-white rounded-2xl border border-mist-100 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)] overflow-hidden max-w-sm mx-auto">
      <div className="relative h-28 bg-[linear-gradient(266deg,#ACFFE1,#CFFFC4)]">
        <span className="absolute top-3 right-3 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase bg-mint-400 text-ink-900">
          Available Now
        </span>
      </div>
      <div className="p-4 flex flex-col gap-2.5">
        <div className="font-bold text-ink-900 text-sm">308 E Green St, Champaign</div>
        <div className="flex gap-1.5">
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-[#3C96FA1A] text-[#3C96FA]">2 Bed</span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-[#8C78FF1A] text-[#8C78FF]">Apartment</span>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-xl font-bold text-ink-900 tracking-tight">
              $785<span className="text-sm text-neutral-400 font-medium">/bed</span>
            </div>
            <div className="text-xs text-neutral-400">$1,570 total, not a teaser price</div>
          </div>
          <span className="text-xs font-bold text-ink-900 bg-mint-400 px-3 py-1.5 rounded-full">View →</span>
        </div>
      </div>
    </div>
  )
}

function MockChat() {
  return (
    <div className="bg-white rounded-2xl border border-mist-100 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)] p-5 flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {["2 Bed", "Under $900/bed", "August", "Near campus"].map(label => (
          <span key={label} className="px-3 py-1.5 rounded-full bg-mist-50 border border-mist-100 text-xs font-bold text-ink-900">
            {label}
          </span>
        ))}
      </div>
      {[
        ["308 E Green St", "$785/bed", "Available August"],
        ["508 E Clark St", "$840/bed", "Available Now"],
        ["710 S 3rd St", "$895/bed", "Available August"],
      ].map(([address, price, availability]) => (
        <div key={address} className="rounded-xl border border-mist-100 px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-bold text-ink-900">{address}</div>
            <div className="text-xs text-neutral-400">{availability}</div>
          </div>
          <div className="text-sm font-extrabold text-ink-900 whitespace-nowrap">{price}</div>
        </div>
      ))}
    </div>
  )
}

function CtaPill({ href = "/card" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="inline-block px-6 py-3 rounded-full bg-mint-400 text-ink-900 text-sm font-bold hover:bg-[#00D68F] transition-colors"
    >
      {CTA_LABEL}
    </Link>
  )
}

export default function AboutV2Page() {
  const [status, setStatus] = useState<DataStatus | null>(null)

  useEffect(() => {
    fetchStatus().then(setStatus).catch(() => {})
  }, [])

  const features: { title: string; body: string; mock: React.ReactNode }[] = [
    {
      title: "Search every company at once",
      body: "Green Street Realty, Universities Group, Smile and every other tracked source answer together in a single result list. No more one-tab-per-landlord archaeology: filter once, compare everything that matches, and let the misses disappear on their own.",
      mock: <MockSources />,
    },
    {
      title: "Track the real price per bed",
      body: "A starting-at price is usually the cheapest unit type, which can cost twice as much per bed as the one you actually want. Every result here is normalized to the exact unit, with the whole-unit total shown right underneath, so what you compare is what you would pay.",
      mock: <MockListingCard />,
    },
    {
      title: "Filter once, compare everywhere",
      body: "Not sure which view is easiest yet? Set your criteria once, then move between cards, a dense table, and the map without rebuilding the search.",
      mock: <MockChat />,
    },
  ]

  return (
    <div className={`${inter.className} min-h-screen bg-white text-ink-900`}>
      <div className="sticky top-0 z-30 bg-white">
        <AppHeader />
      </div>

      {/* Split hero — left copy + repeated CTA, right image with floating chips */}
      <section className="px-6 pt-16 pb-16">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <Reveal>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.1]">
              FIND YOUR UIUC APARTMENT WITH AN{" "}
              <span className="bg-[linear-gradient(266deg,#ACFFE1,#CFFFC4)] rounded-xl px-2 box-decoration-clone">
                REAL LISTING SEARCH
              </span>
            </h1>
            <p className="text-neutral-500 text-base sm:text-lg mt-6 leading-relaxed">
              Search every UIUC-area leasing company in one place, compare honest prices per bed,
              and keep the whole hunt in a single friendly tab.
            </p>
            <div className="mt-8">
              <CtaPill />
            </div>
            {/* Inline mini stats, like the tools page's 9.1/10 · 20 mins · 10 million row */}
            <div className="flex items-center gap-8 mt-10">
              <div>
                <div className="text-2xl font-extrabold tracking-tight">{COMPANIES.length}</div>
                <div className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mt-0.5">companies, one search</div>
              </div>
              <div className="w-px h-9 bg-mist-100" />
              <div>
                <div className="text-2xl font-extrabold tracking-tight">{status?.listing_count?.toLocaleString() ?? "…"}</div>
                <div className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mt-0.5">floor plans tracked</div>
              </div>
              <div className="w-px h-9 bg-mist-100" />
              <div>
                <div className="text-2xl font-extrabold tracking-tight">$/bed</div>
                <div className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mt-0.5">every price normalized</div>
              </div>
            </div>
          </Reveal>
          <Reveal delay={150}>
            <div className="relative">
              <img
                src="/logos/project-picture.png"
                alt="Illustration of a UIUC campus building"
                className="w-full rounded-3xl border border-mist-100 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.15)]"
              />
              <span className="absolute -top-3 -right-2 text-[10px] font-bold px-3 py-1.5 rounded-full uppercase bg-mint-400 text-ink-900 shadow-md animate-[float_5s_ease-in-out_infinite] motion-reduce:animate-none">
                Available Now
              </span>
              <span className="absolute -bottom-3 -left-2 text-xs font-bold px-3.5 py-2 rounded-full bg-white border border-mist-100 text-ink-900 shadow-md animate-[float_6s_ease-in-out_infinite] motion-reduce:animate-none">
                $785<span className="text-neutral-400 font-medium">/bed</span>
              </span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Static logo strip */}
      <section className="px-6 pb-16">
        <p className="text-center text-[11px] font-bold uppercase tracking-widest text-neutral-400 mb-6">
          Searches across
        </p>
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-x-12 gap-y-5">
          {COMPANIES.map(({ name, logo }) => (
            <img key={name} src={logo} alt={name} className="h-5 w-auto object-contain opacity-60" />
          ))}
        </div>
      </section>

      {/* Three feature blocks, each repeating the CTA like the tools page */}
      <section className="px-6 py-20 bg-mist-50">
        <div className="max-w-5xl mx-auto flex flex-col gap-20">
          {features.map(({ title, body, mock }, i) => (
            <Reveal key={title}>
              <div className="grid md:grid-cols-2 gap-10 md:gap-14 items-center">
                <div className={i % 2 === 1 ? "md:order-2" : ""}>
                  <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink-900 mb-4" style={{ textWrap: "balance" }}>
                    {title}
                  </h3>
                  <p className="text-neutral-500 leading-relaxed mb-6">{body}</p>
                  <CtaPill href={i === 2 ? "/map" : "/card"} />
                </div>
                <div className={i % 2 === 1 ? "md:order-1" : ""}>{mock}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Mid-page stats banner — mirrors "Join The Largest Job Board!" */}
      <section className="px-6 py-20">
        <Reveal>
          <div className="max-w-5xl mx-auto rounded-[32px] bg-[linear-gradient(266deg,#ACFFE1,#CFFFC4)] px-8 py-14 text-center">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink-900" style={{ textWrap: "balance" }}>
              Never miss a move-in window again.
            </h2>
            <div className="flex items-center justify-center gap-12 sm:gap-20 mt-8">
              <div>
                <div className="text-4xl sm:text-5xl font-extrabold tracking-tight text-ink-900">
                  {status?.listing_count?.toLocaleString() ?? "…"}
                </div>
                <div className="text-[11px] font-bold uppercase tracking-widest text-ink-900/60 mt-1.5">floor plans</div>
              </div>
              <div>
                <div className="text-4xl sm:text-5xl font-extrabold tracking-tight text-ink-900">{COMPANIES.length}</div>
                <div className="text-[11px] font-bold uppercase tracking-widest text-ink-900/60 mt-1.5">leasing companies</div>
              </div>
            </div>
            <Link
              href="/card"
              className="inline-block px-7 py-3 rounded-full bg-ink-900 text-white text-sm font-bold hover:bg-black transition-colors mt-9"
            >
              {CTA_LABEL}
            </Link>
          </div>
        </Reveal>
      </section>

      {/* Six-benefit grid */}
      <section className="px-6 pb-20">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <h2 className="text-3xl font-extrabold tracking-tight text-ink-900 text-center mb-12">
              Everything the hunt needs, nothing it doesn&rsquo;t
            </h2>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {BENEFITS.map(({ icon, title, body }, i) => (
              <Reveal key={title} delay={(i % 3) * 90}>
                <div className="p-6 bg-white rounded-2xl border border-mist-100 hover:border-mint-400 transition-colors h-full">
                  <div className="w-10 h-10 flex items-center justify-center text-lg rounded-xl bg-mist-50 border border-mist-100 mb-3.5">
                    {icon}
                  </div>
                  <div className="font-bold text-ink-900 mb-1">{title}</div>
                  <p className="text-sm text-neutral-500 leading-relaxed">{body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Pain quotes rail — testimonial slot, kept honest: these are the problems, not invented users */}
      <section className="py-20 bg-mist-50">
        <div className="max-w-5xl mx-auto px-6">
          <Reveal>
            <div className="text-center mb-10">
              <div className="text-[11px] font-bold uppercase tracking-widest text-mint-600 mb-2">Why this exists</div>
              <h2 className="text-3xl font-extrabold tracking-tight text-ink-900">The search we all know too well</h2>
            </div>
          </Reveal>
        </div>
        <Reveal>
          <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory px-6 pb-4 max-w-5xl mx-auto">
            {PAIN_QUOTES.map(({ problem, solution }) => (
              <div key={problem} className="snap-start shrink-0 w-[280px] bg-white rounded-2xl border border-mist-100 p-6">
                <div className="text-3xl leading-none text-neutral-200 font-serif" aria-hidden>&ldquo;</div>
                <p className="text-sm font-medium text-ink-900 leading-relaxed mt-1">{problem}</p>
                <p className="text-sm font-semibold text-mint-600 leading-relaxed mt-3">→ {solution}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Numbered how-it-works — mirrors the tools page's 4-step flow */}
      <section className="px-6 py-24">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <h2 className="text-3xl font-extrabold tracking-tight text-ink-900 text-center mb-14">
              From &ldquo;where do I even start&rdquo; to signed
            </h2>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map(({ n, title, body }, i) => (
              <Reveal key={n} delay={i * 100}>
                <div className="relative p-6 bg-white rounded-2xl border border-mist-100 h-full">
                  <div className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-[linear-gradient(266deg,#00F0A0,#28C86E)] mb-3">
                    {n}
                  </div>
                  <div className="font-bold text-ink-900 mb-1.5">{title}</div>
                  <p className="text-sm text-neutral-500 leading-relaxed">{body}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <div className="text-center mt-12">
              <CtaPill />
            </div>
          </Reveal>
        </div>
      </section>

      {/* FAQ accordion */}
      <section className="px-6 pb-24">
        <div className="max-w-3xl mx-auto">
          <Reveal>
            <h2 className="text-3xl font-extrabold tracking-tight text-ink-900 text-center mb-10">
              Frequently asked questions
            </h2>
          </Reveal>
          <Reveal>
            <div className="flex flex-col gap-3">
              <details className="group bg-white rounded-2xl border border-mist-100 open:border-mint-400 transition-colors">
                <summary className="flex items-center justify-between gap-4 cursor-pointer list-none px-6 py-4 font-bold text-ink-900 text-sm">
                  Is it really free?
                  <span className="text-mint-600 text-lg leading-none transition-transform group-open:rotate-45 motion-reduce:transition-none">+</span>
                </summary>
                <p className="px-6 pb-5 text-sm text-neutral-500 leading-relaxed">
                  Yes. Free for UIUC students, with no hidden fees, no forms handed to leasing
                  offices, and no follow-up calls.
                </p>
              </details>
              <details className="group bg-white rounded-2xl border border-mist-100 open:border-mint-400 transition-colors">
                <summary className="flex items-center justify-between gap-4 cursor-pointer list-none px-6 py-4 font-bold text-ink-900 text-sm">
                  Which companies does one search cover?
                  <span className="text-mint-600 text-lg leading-none transition-transform group-open:rotate-45 motion-reduce:transition-none">+</span>
                </summary>
                <p className="px-6 pb-5 text-sm text-neutral-500 leading-relaxed">
                  {COMPANIES.map(c => c.name).join(", ")}. All of them answer in one result list.
                </p>
              </details>
              <details className="group bg-white rounded-2xl border border-mist-100 open:border-mint-400 transition-colors">
                <summary className="flex items-center justify-between gap-4 cursor-pointer list-none px-6 py-4 font-bold text-ink-900 text-sm">
                  Are prices per bed or for the whole unit?
                  <span className="text-mint-600 text-lg leading-none transition-transform group-open:rotate-45 motion-reduce:transition-none">+</span>
                </summary>
                <p className="px-6 pb-5 text-sm text-neutral-500 leading-relaxed">
                  Both, honestly. Every result is normalized to the real price per bed for that
                  exact unit, and the whole-unit total sits right under it.
                </p>
              </details>
              <details className="group bg-white rounded-2xl border border-mist-100 open:border-mint-400 transition-colors">
                <summary className="flex items-center justify-between gap-4 cursor-pointer list-none px-6 py-4 font-bold text-ink-900 text-sm">
                  How current are the listings?
                  <span className="text-mint-600 text-lg leading-none transition-transform group-open:rotate-45 motion-reduce:transition-none">+</span>
                </summary>
                <p className="px-6 pb-5 text-sm text-neutral-500 leading-relaxed">
                  Listings are kept up to date from each company&rsquo;s own site, and availability
                  windows are part of every search, so leased units are labeled instead of hidden.
                </p>
              </details>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-10 border-t border-mist-100">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm">
            <span className="font-extrabold text-ink-900">UIUC Housing</span>
            <span className="text-neutral-400 ml-2">Built for UIUC students in Champaign-Urbana.</span>
          </div>
          <div className="flex items-center gap-5 text-sm font-semibold text-ink-900">
            <Link href="/table" className="hover:text-mint-600 transition-colors">Table</Link>
            <Link href="/map" className="hover:text-mint-600 transition-colors">Map</Link>
            <Link href="/card" className="hover:text-mint-600 transition-colors">Card</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
