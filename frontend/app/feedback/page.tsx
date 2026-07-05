"use client"

import { useState, useRef } from "react"
import AppHeader from "@/components/AppHeader"

const ORANGE = "#ff5f05"

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
    <div className="relative h-screen bg-neutral-100 overflow-hidden">
      <div className="h-full overflow-y-auto">
        <div className="min-h-full flex items-start justify-center pt-28 pb-10 px-6">
          <div className="w-full max-w-[560px] bg-white rounded-3xl shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)] p-8 sm:p-10">
            {status === "sent" ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-4">🎉</div>
                <h1 className="text-xl font-bold text-neutral-900 mb-2">Thank you!</h1>
                <p className="text-sm text-neutral-500 mb-6">
                  Your feedback went straight to the developer.
                </p>
                <button
                  onClick={reset}
                  className="px-5 py-2.5 rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: ORANGE }}
                >
                  Send another
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} onPaste={handlePaste}>
                <h1 className="text-xl font-bold text-neutral-900 mb-1">Rate &amp; Report</h1>
                <p className="text-sm text-neutral-500 mb-6">
                  Rate the product, report what&apos;s broken, or tell me what you want next.
                </p>

                {/* Rating */}
                <div className="mb-6">
                  <label className="text-xs font-bold uppercase tracking-widest text-neutral-400 block mb-2">
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
                        style={{ color: (hoverRating || rating) >= star ? ORANGE : "#d4d4d4" }}
                        aria-label={`${star} star${star > 1 ? "s" : ""}`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>

                {/* Message */}
                <div className="mb-5">
                  <label className="text-xs font-bold uppercase tracking-widest text-neutral-400 block mb-2">
                    What&apos;s on your mind?
                  </label>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder={PLACEHOLDER}
                    rows={6}
                    className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-300 resize-y"
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
                        className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-neutral-900 text-white text-sm flex items-center justify-center shadow-md hover:bg-neutral-700"
                        aria-label="Remove screenshot"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full rounded-2xl border-2 border-dashed border-neutral-300 px-4 py-6 text-sm text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 transition-colors"
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
                  <p className="text-sm text-red-500 mb-4">{errorMsg}</p>
                )}

                <button
                  type="submit"
                  disabled={status === "sending"}
                  className="w-full py-3 rounded-xl text-white text-base font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: ORANGE }}
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
