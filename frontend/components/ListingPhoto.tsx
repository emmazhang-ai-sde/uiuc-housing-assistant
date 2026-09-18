"use client"

import { useState } from "react"

type Props = {
  src?: string | null
  className?: string
  imgClassName?: string
  compact?: boolean
}

export default function ListingPhoto({ src, className = "", imgClassName = "", compact = false }: Props) {
  const [failed, setFailed] = useState(false)
  const [prevSrc, setPrevSrc] = useState(src)

  if (src !== prevSrc) {
    setPrevSrc(src)
    setFailed(false)
  }

  const showImage = !!src && !failed

  return (
    <div className={`relative overflow-hidden bg-mist-50 ${className}`}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          onError={() => setFailed(true)}
          className={`h-full w-full object-cover ${imgClassName}`}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,rgba(255,253,238,0.95),rgba(233,234,239,0.65))]">
          <div className={`rounded-full border border-mist-100 bg-white/75 font-semibold uppercase tracking-wide text-ink-900/35 ${
            compact ? "px-2 py-1 text-[9px]" : "px-3 py-1.5 text-[10px]"
          }`}>
            No photo
          </div>
        </div>
      )}
    </div>
  )
}
