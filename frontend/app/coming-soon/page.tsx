"use client"

import { useState, useEffect } from "react"
import confetti from "canvas-confetti"
import { createClient } from "@/lib/supabase/client"

export default function ComingSoonPage() {
  const [netid, setNetid]       = useState("")
  const [done, setDone]         = useState(false)
  const [position, setPosition] = useState<number | null>(null)
  const [error, setError]       = useState("")
  const [loading, setLoading]   = useState(false)
  const [totalCount, setTotalCount] = useState<number | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has("preview")) {
      setNetid("netid")
      setPosition(42)
      setTotalCount(42)
      setDone(true)
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } })
      return
    }
    createClient()
      .from("waitlist")
      .select("*", { count: "exact", head: true })
      .then(({ count }) => setTotalCount(count))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = netid.trim().toLowerCase().replace(/@illinois\.edu$/i, "")
    if (!trimmed) return
    const email = `${trimmed}@illinois.edu`
    setLoading(true)
    setError("")
    const supabase = createClient()
    const { error: err } = await supabase.from("waitlist").insert({ email })
    if (err && err.code !== "23505") {
      setError(err.message)
    } else {
      // get this email's created_at to calculate original position
      const { data: row } = await supabase
        .from("waitlist")
        .select("created_at")
        .eq("email", email)
        .single()
      const { count: pos } = row
        ? await supabase
            .from("waitlist")
            .select("*", { count: "exact", head: true })
            .lte("created_at", row.created_at)
        : await supabase.from("waitlist").select("*", { count: "exact", head: true })
      const { count: total } = await supabase
        .from("waitlist")
        .select("*", { count: "exact", head: true })
      setPosition(pos)
      setTotalCount(total)
      setDone(true)
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } })
    }
    setLoading(false)
  }

  return (
    <div className="min-h-dvh w-full flex items-center justify-center bg-white px-6 py-16">
      <div className="w-full max-w-md flex flex-col items-center gap-10 text-center">

        {/* Badge */}
        <span className="px-3 py-1 rounded-full border border-neutral-200 text-xs font-semibold uppercase tracking-widest text-neutral-900">
          Private Beta · Coming Soon
        </span>

        {/* Headline */}
        <div className="space-y-4">
          <h1 className="text-6xl font-bold tracking-tight text-neutral-900 leading-[1.05]">
            Find housing<br />near UIUC<br />in seconds.
          </h1>
          <p className="text-neutral-900 font-semibold text-lg leading-relaxed">
            We cover every UIUC landlord.
          </p>
          <div className="flex flex-wrap justify-center items-center gap-4 pt-2">
            {[
              { src: "/logos/company-logo-green-street-realty.png", alt: "Green Street Realty" },
              { src: "/logos/company-logo-university-group.png",    alt: "University Group" },
              { src: "/logos/company-logo-mhm-properties.png",      alt: "MHM Properties" },
              { src: "/logos/company-logo-yugo.webp",                alt: "Yugo" },
              { src: "/logos/company-logo-707.svg",                 alt: "707" },
              { src: "/logos/company-logo-hub.svg",                 alt: "HUB" },
              { src: "/logos/company-logo-dean.svg",                alt: "Dean" },
              { src: "/logos/company-logo-roland.png",              alt: "Roland" },
              { src: "/logos/company-logo-smile.png",               alt: "Smile" },
            ].map(({ src, alt }) => (
              <img key={src} src={src} alt={alt} className="h-8 w-auto object-contain" />
            ))}
          </div>
          {totalCount !== null && totalCount > 0 && (
            <p className="text-base font-semibold" style={{ color: "rgb(255, 95, 5)" }}>
🔥 {totalCount} UIUC student{totalCount !== 1 ? "s" : ""} already on the waitlist!
            </p>
          )}
        </div>

        {/* Form */}
        <div className="w-full">
          {done ? (
            <div className="space-y-1.5 py-2">
              <p className="text-lg font-bold" style={{ color: "#2d8a4e" }}>
                You&apos;re on the list
                {position !== null && (
                  <span> — #{position}</span>
                )}
                .
              </p>
              <p className="text-base text-neutral-900">
                We&apos;ll email{" "}
                <span className="font-mono font-bold" style={{ color: "rgb(255, 95, 5)" }}>
                  {netid.trim().toLowerCase()}@illinois.edu
                </span>{" "}
                when beta opens.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex flex-col gap-2">
                <div className="flex items-center rounded-xl border border-neutral-200 bg-neutral-50 overflow-hidden focus-within:border-neutral-400 focus-within:bg-white transition-all">
                  <input
                    type="text"
                    value={netid}
                    onChange={e => setNetid(e.target.value)}
                    placeholder="write your netid here"
                    required
                    className="flex-1 px-4 py-3 text-base placeholder-neutral-400 focus:outline-none bg-transparent" style={{ color: "rgb(255, 95, 5)" }}
                  />
                  <span className="pr-4 text-base font-semibold select-none" style={{ color: "rgb(255, 95, 5)" }}>@illinois.edu</span>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-neutral-900 text-white text-base font-semibold hover:bg-neutral-700 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {loading ? "…" : "Get early access"}
                </button>
              </div>
              {error && <p className="text-sm text-red-500 text-left">{error}</p>}
              <p className="text-sm text-neutral-900">@illinois.edu only · Free · No spam</p>
            </form>
          )}
        </div>

        {/* Why waitlist */}
        <div className="w-full border-t border-black pt-8 space-y-2 text-center">
          <p className="text-base font-semibold text-neutral-900">Why a waitlist?</p>
          <p className="text-base text-neutral-900 leading-relaxed">
            I&apos;m not entirely sure how many people the backend can handle at once, so I&apos;m starting small.{" "}
            <span className="font-bold" style={{ color: "rgb(255, 95, 5)" }}>Waitlist members will get first access when beta opens.</span>
          </p>
        </div>

        {/* Can't wait section */}
        <div className="w-full border-t border-black pt-8 space-y-3 text-center">
          <p className="text-base font-semibold text-neutral-900">Need housing before we launch? We&apos;ve got you.</p>
          <p className="text-base text-neutral-900 leading-relaxed">
          Join our 小红书 group <span className="font-semibold">UIUC-housing-ai website</span> and{" "}
            <a
              href="https://www.xiaohongshu.com/user/profile/68d566db0000000021025f29"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline underline-offset-2"
            >
              @momo找工日记
            </a>
            {" "}(me) your housing requirements — I'll search manually and send you screenshots.
          </p>
          <p className="text-sm text-neutral-900">
            RedNote →{" "}
            <a
              href="https://www.xiaohongshu.com/user/profile/68d566db0000000021025f29"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono font-semibold underline underline-offset-2"
            >
              momo找工日记
            </a>
            {" "}→ 群聊 → <strong>UIUC-housing-ai website</strong>
          </p>
          <a
            href="https://www.xiaohongshu.com/user/profile/68d566db0000000021025f29"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src="/rednote-group-qr.jpeg"
              alt="RedNote QR code"
              className="mx-auto w-72 h-72 object-cover rounded-xl"
            />
          </a>
        </div>

      </div>
    </div>
  )
}
