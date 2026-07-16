"use client"

import { useState, useRef } from "react"
import AppHeader from "@/components/AppHeader"
import { inter } from "@/lib/fonts"

// Filled-star color — jobright's amber tag color, keeps the gold-star
// convention while staying inside the jobright palette.
const STAR_AMBER = "#FDA700"

// Example openers shown in the textarea placeholder, straight from the ask.
const PLACEHOLDER =
  "Tell the developer: I want...\n\n" +
  "Hi developer, this doesn't work: ...\n\n" +
  "Paste a screenshot here, or use the button below."

export default function FeedbackPage() {
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [message, setMessage] = useState("")
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  function attachImage(file: File) {
    if (!file.type.startsWith("image/")) return
    setImage(file)
    setImagePreview(URL.createObjectURL(file))
  }

  // Paste a screenshot straight into the box (Cmd/Ctrl+V after a screen grab).
  function handlePaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith("image/"))
    if (item) {
      const file = item.getAsFile()
      if (file) { attachImage(file); e.preventDefault() }
    }
  }

  function removeImage() {
    setImage(null)
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (rating === 0 && !message.trim() && !image) {
      setErrorMsg("Add a rating, a message, or a screenshot.")
      setStatus("error")
      return
    }
    setStatus("sending")
    setErrorMsg("")

    const form = new FormData()
    if (rating > 0) form.set("rating", String(rating))
    if (message.trim()) form.set("message", message.trim())
    if (image) form.set("image", image)

    try {
      const res = await fetch("/api/feedback", { method: "POST", body: form })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setErrorMsg(data?.error ?? "Something went wrong. Please try again.")
        setStatus("error")
        return
      }
      setStatus("sent")
    } catch {
      setErrorMsg("Something went wrong. Please try again.")
      setStatus("error")
    }
  }

  function reset() {
    setRating(0)
    setMessage("")
    removeImage()
    setStatus("idle")
    setErrorMsg("")
  }

  return (
    <div className={`${inter.className} relative h-screen bg-mist-50 overflow-hidden`}>
      <div className="h-full overflow-y-auto">
        <div className="min-h-full flex items-start justify-center pt-28 pb-10 px-6">
          <div className="w-full max-w-[560px] bg-white rounded-2xl border border-mist-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-8 sm:p-10">
            {status === "sent" ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-4">🎉</div>
                <h1 className="text-xl font-extrabold tracking-tight text-ink-900 mb-2">Thank you!</h1>
                <p className="text-sm text-neutral-500 mb-6">
                  Your feedback went straight to the developer.
                </p>
                <button
                  onClick={reset}
                  className="px-5 py-2.5 rounded-full text-sm font-bold bg-mint-400 text-ink-900 hover:bg-[#00D68F] transition-colors"
                >
                  Send another
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} onPaste={handlePaste}>
                <h1 className="text-xl font-extrabold tracking-tight text-ink-900 mb-1">Rate &amp; Report</h1>
                <p className="text-sm text-neutral-500 mb-6">
                  Rate the product, report what&apos;s broken, or tell me what you want next.
                </p>

                {/* Rating */}
                <div className="mb-6">
                  <label className="text-[11px] font-bold uppercase tracking-widest text-mint-600 block mb-2">
                    How would you rate it?
                  </label>
                  <div className="flex gap-1" onMouseLeave={() => setHoverRating(0)}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star === rating ? 0 : star)}
                        onMouseEnter={() => setHoverRating(star)}
                        className="text-3xl leading-none transition-transform hover:scale-110"
                        style={{ color: (hoverRating || rating) >= star ? STAR_AMBER : "#d4d4d4" }}
                        aria-label={`${star} star${star > 1 ? "s" : ""}`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>

                {/* Message */}
                <div className="mb-5">
                  <label className="text-[11px] font-bold uppercase tracking-widest text-mint-600 block mb-2">
                    What&apos;s on your mind?
                  </label>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder={PLACEHOLDER}
                    rows={6}
                    className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-sm text-ink-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-mint-400 resize-y"
                  />
                </div>

                {/* Screenshot */}
                <div className="mb-6">
                  {imagePreview ? (
                    <div className="relative inline-block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imagePreview}
                        alt="Attached screenshot"
                        className="max-h-56 rounded-2xl border border-neutral-200"
                      />
                      <button
                        type="button"
                        onClick={removeImage}
                        className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-ink-900 text-white text-sm flex items-center justify-center shadow-md hover:bg-black"
                        aria-label="Remove screenshot"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full rounded-2xl border-2 border-dashed border-neutral-200 px-4 py-6 text-sm text-neutral-500 hover:border-mint-400 hover:text-ink-900 transition-colors"
                    >
                      📎 Paste a screenshot, or click to upload an image
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) attachImage(file)
                    }}
                  />
                </div>

                {status === "error" && (
                  <p className="text-sm text-[#FF465A] mb-4">{errorMsg}</p>
                )}

                <button
                  type="submit"
                  disabled={status === "sending"}
                  className="w-full py-3 rounded-full bg-mint-400 text-ink-900 text-base font-bold hover:bg-[#00D68F] transition-colors disabled:opacity-50"
                >
                  {status === "sending" ? "Sending…" : "Send to developer"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      <div className="absolute top-0 inset-x-0 z-30 pointer-events-none [&_header>div]:pointer-events-auto">
        <AppHeader />
      </div>
    </div>
  )
}
