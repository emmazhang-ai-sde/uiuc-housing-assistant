"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import AppHeader from "@/components/AppHeader"
import { fetchStatus, DataStatus } from "@/lib/api"
import { COMPANIES } from "@/lib/companies"
import { inter } from "@/lib/fonts"

// Jobright-style landing rebuild (2026-07-15). Section order mirrors
// jobright.ai/ai-agent: hero → logo marquee → stats band → "always on"
// feature rows → pain wall → two ways to start → CTA banner → footer.
// Previous version archived at design-docs/post-launch/archive/about-page-jobright-v1.tsx

const TYPED_QUERIES = [
  "2BR · under $900/bed · near Grainger",
  "Studio · available now",
  "4BR · near the Quad",
  "Houses · August 2026",
]

const EXTRAS = [
  {
    title: "Live availability",
    body: "Listings stay up to date, so a unit that is already leased never shows up as available.",
  },
  {
    title: "Distance you can see",
    body: "Every listing is plotted relative to campus, with walk and drive times to real landmarks.",
  },
  {
    title: "Free, no spam",
    body: "No login walls, no forms handed to leasing offices, no follow-up calls.",
  },
]

/* ---------- animation helpers ---------- */

// Fade-up on first scroll into view. Skips motion (but never hides content)
// when the user prefers reduced motion.
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

// Types its text out letter by letter the first time it scrolls into view,
// then hides the caret. Reduced-motion users get the full text immediately.
function TypedHeading({ text }: { text: string }) {
  const ref = useRef<HTMLHeadingElement>(null)
  const [started, setStarted] = useState(false)
  const [shown, setShown] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true)
          io.disconnect()
        }
      },
      { threshold: 0.6 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!started) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(text.length)
      return
    }
    if (shown >= text.length) return
    const timer = window.setTimeout(() => setShown(s => s + 1), 55)
    return () => window.clearTimeout(timer)
  }, [started, shown, text])

  return (
    <h2 ref={ref} className="text-3xl sm:text-4xl font-extrabold tracking-tight text-ink-900 min-h-[1.25em]">
      {text.slice(0, shown)}
      {started && shown < text.length && (
        <span className="inline-block w-[3px] h-[0.9em] bg-mint-400 align-middle ml-1" aria-hidden />
      )}
      <span className="sr-only">{text}</span>
    </h2>
  )
}

// Typewriter loop over example queries, shown inside the hero's mock search
// pill. Reduced-motion users get the first query as static text.
function TypedQuery() {
  const [text, setText] = useState("")

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setText(TYPED_QUERIES[0])
      return
    }
    let queryIdx = 0
    let charIdx = 0
    let deleting = false
    let timer: number

    const tick = () => {
      const q = TYPED_QUERIES[queryIdx]
      if (!deleting) {
        charIdx += 1
        setText(q.slice(0, charIdx))
        if (charIdx === q.length) {
          deleting = true
          timer = window.setTimeout(tick, 1700)
          return
        }
        timer = window.setTimeout(tick, 45)
      } else {
        charIdx -= 1
        setText(q.slice(0, charIdx))
        if (charIdx === 0) {
          deleting = false
          queryIdx = (queryIdx + 1) % TYPED_QUERIES.length
        }
        timer = window.setTimeout(tick, 22)
      }
    }
    timer = window.setTimeout(tick, 500)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <>
      {text}
      <span className="inline-block w-0.5 h-[1.1em] bg-mint-600 align-middle ml-0.5 animate-pulse motion-reduce:animate-none" />
    </>
  )
}

/* ---------- CSS-only product mocks for the feature rows ---------- */

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

function MockMapSearch() {
  return (
    <div className="bg-white rounded-2xl border border-mist-100 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)] p-5">
      <div className="flex flex-wrap gap-2 mb-4">
        {["2 Bed", "< $900/bed", "Available August", "Apartment"].map(label => (
          <span key={label} className="px-3 py-1.5 rounded-full bg-mist-50 border border-mist-100 text-xs font-bold text-ink-900">
            {label}
          </span>
        ))}
      </div>
      <div className="relative h-48 rounded-2xl overflow-hidden bg-[linear-gradient(135deg,#EFF6F2,#D9F8E8)] border border-mist-100">
        <div className="absolute inset-0 opacity-60 bg-[linear-gradient(90deg,transparent_23px,#ffffff_24px),linear-gradient(0deg,transparent_23px,#ffffff_24px)] bg-[length:48px_48px]" />
        {[
          ["left-[18%] top-[30%]", "$785"],
          ["left-[55%] top-[22%]", "$860"],
          ["left-[68%] top-[62%]", "$895"],
          ["left-[34%] top-[68%]", "$820"],
        ].map(([pos, price]) => (
          <span
            key={price}
            className={`absolute ${pos} -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-900 text-white text-xs font-bold px-3 py-1.5 shadow-lg`}
          >
            {price}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function AboutPage() {
  const [status, setStatus] = useState<DataStatus | null>(null)

  useEffect(() => {
    fetchStatus().then(setStatus).catch(() => {})
  }, [])

  const statBlocks = [
    { value: status?.listing_count?.toLocaleString() ?? "…", label: "Floor plans tracked" },
    { value: status?.property_count?.toLocaleString() ?? "…", label: "Properties across town" },
    { value: String(COMPANIES.length), label: "Companies, one search" },
    { value: "100%", label: "Free for UIUC students" },
  ]

  const features: { title: string; body: string; cta: { label: string; href: string }; mock: React.ReactNode }[] = [
    {
      title: "One Search, Every Company",
      body: "Green Street Realty, Universities Group, Smile and every other tracked source, answered together in one list instead of twelve tabs.",
      cta: { label: "Browse Every Company", href: "/card" },
      mock: <MockSources />,
    },
    {
      title: "The Real Price Per Bed",
      body: "A starting-at price is usually the cheapest unit type, which can cost twice as much per bed as the one you want. Every result here is normalized to the exact unit, so comparisons stay honest.",
      cta: { label: "Compare Real Prices", href: "/card" },
      mock: <MockListingCard />,
    },
    {
      title: "Filter Once, See It Everywhere",
      body: "Choose beds, budget, move-in window, company, and property type once. The same filtered dataset powers the card grid, table, and full-screen map.",
      cta: { label: "Open the Map", href: "/map" },
      mock: <MockMapSearch />,
    },
  ]

  return (
    <div className={`${inter.className} min-h-screen bg-white text-ink-900`}>
      <div className="sticky top-0 z-30 bg-white">
        <AppHeader />
      </div>

      {/* Hero — mirrors jobright's SKIP THE HUNT block */}
      <section className="px-6 pt-20 pb-16 text-center">
        <Reveal>
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-mist-50 border border-mist-100 text-[11px] font-bold uppercase tracking-widest text-neutral-500 mb-7">
            <span className="w-2 h-2 rounded-full bg-mint-400" />
            UIUC housing search, built around real listings
          </div>
          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight leading-[1.08] max-w-3xl mx-auto">
            <span className="block">SKIP THE TAB-HOPPING</span>
            <span className="block mt-3">
              <span className="bg-[linear-gradient(266deg,#ACFFE1,#CFFFC4)] rounded-2xl px-3 box-decoration-clone">
                Find Your Place Faster
              </span>
            </span>
          </h1>
        </Reveal>
        <Reveal delay={120}>
          <div className="flex items-center gap-2.5 max-w-md mx-auto mt-9 rounded-full border border-mist-100 bg-white px-5 py-3 text-sm text-neutral-600 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.15)] text-left">
            <span aria-hidden>🔍</span>
            <span className="truncate"><TypedQuery /></span>
          </div>
          <p className="text-neutral-500 text-base sm:text-lg max-w-xl mx-auto mt-6 leading-relaxed">
            One searchable dataset across UIUC-area leasing companies, with honest price per bed,
            live availability, and map-first comparison.
          </p>
          <div className="flex items-center justify-center gap-3 mt-8">
            <Link
              href="/card"
              className="px-6 py-3 rounded-full bg-mint-400 text-ink-900 text-sm font-bold hover:bg-[#00D68F] transition-colors"
            >
              Search listings
            </Link>
            <Link
              href="/map"
              className="px-6 py-3 rounded-full bg-white border border-neutral-200 text-ink-900 text-sm font-bold hover:border-neutral-400 transition-colors"
            >
              Browse the map
            </Link>
          </div>
        </Reveal>
        <Reveal delay={240}>
          <img
            src="/logos/project-picture.png"
            alt="Illustration of a UIUC campus building"
            className="w-full max-w-3xl mx-auto mt-14 rounded-3xl border border-mist-100 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.15)]"
          />
        </Reveal>
      </section>

      {/* Stats + coverage panel — one gradient card like jobright's tools-page
          strip: big stats with left rules on top, thin divider, then a labeled
          logo row. Replaces the old marquee + grey stats band. */}
      <section className="px-6 pb-20">
        <Reveal>
          {/* Exact values from jobright's .seo-rating-section-content:
              border-radius 0 80px 80px 80px (square top-left), gradient
              266deg #B5FFE4→#D2FFC8, 72px padding, 2px solid black left rules
              with 48px inset, 52/60 bold values, 18/24 medium labels,
              2px rgba(0,0,0,.04) divider, 32px gaps, logo row justify-between.
              Mobile sizes are our own fallback (their page is desktop-only). */}
          <div className="max-w-6xl mx-auto rounded-[0_80px_80px_80px] bg-[linear-gradient(266deg,#B5FFE4,#D2FFC8)] p-8 md:p-[72px]">
            {/* 4 stats (jobright fits 3), so slightly smaller values and a
                tighter 32px inset keep every label on one line */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-8">
              {statBlocks.map(({ value, label }) => (
                <div key={label} className="border-l-2 border-black pl-5 lg:pl-8 pr-2">
                  <div className="text-3xl md:text-[44px] md:leading-[52px] font-bold text-black whitespace-nowrap">{value}</div>
                  <div className="text-sm md:text-[15px] lg:text-base font-medium text-black capitalize mt-1.5">{label}</div>
                </div>
              ))}
            </div>
            <div className="mt-8 border-t-2 border-[rgba(0,0,0,0.04)]" />
            {/* 8 logos read as two tidy rows of four instead of a ragged wrap */}
            <div className="pt-8 flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-12">
              <span className="text-lg md:text-2xl md:leading-8 font-medium text-black whitespace-nowrap lg:shrink-0">One search across</span>
              <div className="flex-1 grid grid-cols-3 sm:grid-cols-4 gap-x-8 gap-y-6 items-center justify-items-center">
                {COMPANIES.map(({ name, logo }) => (
                  <img key={name} src={logo} alt={name} className="h-5 max-w-[110px] w-auto object-contain" />
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Feature rows — per-block bold title, dark body, black pill CTA with
          circled arrow (button radius 28px, black, hover #00F0A0CC, straight
          from jobright's CSS). Centered sentence-case headline, white bg. */}
      <section className="px-6 py-24">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-ink-900 text-center mb-16" style={{ textWrap: "balance" }}>
              A Housing Search That&rsquo;s Always On
            </h2>
          </Reveal>
          <div className="flex flex-col gap-20">
            {features.map(({ title, body, cta, mock }, i) => (
              <Reveal key={title}>
                <div className="grid md:grid-cols-2 gap-10 md:gap-14 items-center">
                  <div className={i % 2 === 1 ? "md:order-2" : ""}>
                    <h3 className="text-3xl sm:text-4xl font-bold tracking-tight text-ink-900 mb-4">{title}</h3>
                    <p className="text-base text-ink-900/80 font-medium leading-relaxed mb-8">{body}</p>
                    <Link
                      href={cta.href}
                      className="inline-flex items-center gap-3 rounded-[28px] bg-black text-white px-6 py-3.5 text-base font-semibold hover:bg-[#00F0A0CC] transition-colors"
                    >
                      {cta.label}
                      <span className="w-6 h-6 rounded-full bg-white text-black flex items-center justify-center text-sm leading-none" aria-hidden>
                        ›
                      </span>
                    </Link>
                  </div>
                  <div className={i % 2 === 1 ? "md:order-1" : ""}>{mock}</div>
                </div>
              </Reveal>
            ))}
          </div>

          {/* Secondary trio */}
          <Reveal>
            <div className="grid sm:grid-cols-3 gap-4 mt-20">
              {EXTRAS.map(({ title, body }) => (
                <div key={title} className="p-6 bg-white rounded-2xl border border-mist-100 hover:border-mint-400 transition-colors">
                  <span className="w-6 h-6 rounded-full bg-[#28C86E1A] text-mint-600 flex items-center justify-center text-xs font-bold mb-3">✓</span>
                  <div className="font-bold text-ink-900 mb-1.5">{title}</div>
                  <p className="text-sm text-neutral-500 leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Two ways to start — full-bleed grey band (Apple-style, contrasts with
          the white features above and the gradient CTA below), white
          question-cards with tag chips, typewriter title */}
      <section className="px-6 py-24 bg-mist-50">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <div className="text-center mb-12">
              <TypedHeading text="Two Ways to Start" />
            </div>
          </Reveal>
          <div className="grid sm:grid-cols-2 gap-6">
            <Reveal>
              <div className="p-8 bg-white rounded-3xl border border-mist-100 hover:border-mint-400 hover:-translate-y-1 hover:shadow-[0_16px_40px_-16px_rgba(0,0,0,0.15)] transition-all duration-200 motion-reduce:transition-none motion-reduce:hover:translate-y-0 h-full flex flex-col">
                <div className="w-11 h-11 flex items-center justify-center text-xl mb-4 rounded-xl bg-mist-50 border border-mist-100">🎯</div>
                <div className="text-lg font-extrabold text-ink-900 mb-2">Already know what you want?</div>
                <p className="text-sm text-neutral-500 leading-relaxed">
                  Set your filters, then compare everything that matches, side by side or plotted
                  around campus.
                </p>
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {["Beds", "Budget", "Move-in date", "Company"].map(tag => (
                    <span key={tag} className="px-2 py-1 rounded-md bg-black/[.04] text-[13px] font-medium text-ink-900">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-3 mt-auto pt-6">
                  <Link href="/map" className="px-5 py-2.5 rounded-full bg-mint-400 text-ink-900 text-sm font-bold hover:bg-[#00D68F] transition-colors">
                    See the Map
                  </Link>
                </div>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div className="p-8 bg-white rounded-3xl border border-mist-100 hover:border-mint-400 hover:-translate-y-1 hover:shadow-[0_16px_40px_-16px_rgba(0,0,0,0.15)] transition-all duration-200 motion-reduce:transition-none motion-reduce:hover:translate-y-0 h-full flex flex-col">
                <div className="w-11 h-11 flex items-center justify-center text-xl mb-4 rounded-xl bg-mist-50 border border-mist-100">▦</div>
                <div className="text-lg font-extrabold text-ink-900 mb-2">Need to compare quickly?</div>
                <p className="text-sm text-neutral-500 leading-relaxed">
                  Use the table when you want a dense view of prices, availability, landlords,
                  and unit details without opening every listing card.
                </p>
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {["Sortable rows", "Price ranges", "Source links"].map(tag => (
                    <span key={tag} className="px-2 py-1 rounded-md bg-black/[.04] text-[13px] font-medium text-ink-900">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-3 mt-auto pt-6">
                  <Link href="/table" className="px-5 py-2.5 rounded-full bg-mint-400 text-ink-900 text-sm font-bold hover:bg-[#00D68F] transition-colors">
                    Open the Table
                  </Link>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section className="px-6 pt-10 pb-24">
        <Reveal>
          <div className="max-w-5xl mx-auto rounded-[32px] bg-[linear-gradient(266deg,#ACFFE1,#CFFFC4)] px-8 py-16 text-center">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-ink-900">Ready to find your place?</h2>
            <p className="text-sm text-ink-900/70 font-medium mt-3">
              Every UIUC-area leasing company, one search.
            </p>
            <Link
              href="/card"
              className="inline-block px-7 py-3 rounded-full bg-ink-900 text-white text-sm font-bold hover:bg-black transition-colors mt-8"
            >
              Get started
            </Link>
          </div>
        </Reveal>
      </section>

      {/* Footer — jobright's multi-column layout: bold wordmark row on top,
          then bold column headers with link lists. Coverage is informational
          (no product pages per company yet), so those entries are plain text. */}
      <footer className="px-6 pt-14 pb-12 border-t border-mist-100">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-12">
            <div className="text-2xl font-extrabold tracking-tight text-ink-900">UIUC Housing</div>
            <div className="text-sm text-neutral-400">Built for UIUC students in Champaign-Urbana.</div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-10 gap-y-12">
            <div>
              <div className="font-bold text-ink-900 mb-4">Features</div>
              <ul className="space-y-2.5 text-[15px]">
                {([
                  ["Card View", "/card"],
                  ["Table View", "/table"],
                  ["Map View", "/map"],
                  ["Rate & Report", "/feedback"],
                ] as const).map(([label, href]) => (
                  <li key={href}>
                    <Link href={href} className="text-ink-900/80 hover:text-mint-600 transition-colors">{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="md:col-span-2">
              <div className="font-bold text-ink-900 mb-4">Coverage</div>
              <ul className="grid grid-cols-2 gap-x-8 gap-y-2.5 text-[15px] text-ink-900/60">
                {COMPANIES.map(({ name }) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
            <div className="md:justify-self-end">
              <div className="font-bold text-ink-900 mb-4">Information</div>
              <ul className="space-y-2.5 text-[15px]">
                {([
                  ["About Us", "/about"],
                  ["Join the Waitlist", "/coming-soon"],
                  ["Log In", "/login"],
                  ["My Account", "/account"],
                ] as const).map(([label, href]) => (
                  <li key={href}>
                    <Link href={href} className="text-ink-900/80 hover:text-mint-600 transition-colors">{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
