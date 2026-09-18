"use client"

import { useRef, useState } from "react"

const STAR_AMBER = "#B9822B"

const PLACEHOLDER =
  "Tell the developer: I want...\n\n" +
  "Hi developer, this doesn't work: ...\n\n" +
  "Paste a screenshot here, or use the button below."

export default function FeedbackForm({ className = "" }: { className?: string }) {
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

  function handlePaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith("image/"))
    if (item) {
      const file = item.getAsFile()
      if (file) {
        attachImage(file)
        e.preventDefault()
      }
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

  if (status === "sent") {
    return (
      <div className={`text-center py-8 ${className}`}>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blush-pink text-xl font-black text-forest-green">
          ✓
        </div>
        <h1 className="text-xl font-extrabold tracking-tight text-ink-900 mb-2">Thank you</h1>
        <p className="text-sm text-ink-900/60 mb-6">
          Your feedback went straight to the developer.
        </p>
        <button
          onClick={reset}
          className="px-5 py-2.5 rounded-full text-sm font-bold bg-forest-green text-warm-ivory hover:bg-ink-900 transition-colors"
        >
          Send another
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} onPaste={handlePaste} className={className}>
      <h1 className="text-xl font-extrabold tracking-tight text-ink-900 mb-1">Rate &amp; Report</h1>
      <p className="text-sm text-ink-900/60 mb-6">
        Rate the product, report what&apos;s broken, or tell me what you want next.
      </p>

      <div className="mb-6">
        <label className="text-[11px] font-bold uppercase tracking-widest text-forest-green block mb-2">
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
              style={{ color: (hoverRating || rating) >= star ? STAR_AMBER : "#d8cbb1" }}
              aria-label={`${star} star${star > 1 ? "s" : ""}`}
            >
              ★
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5">
        <label className="text-[11px] font-bold uppercase tracking-widest text-forest-green block mb-2">
          What&apos;s on your mind?
        </label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={6}
          className="w-full rounded-2xl border border-mist-100 bg-warm-ivory/70 px-4 py-3 text-sm text-ink-900 placeholder:text-ink-900/35 focus:outline-none focus:ring-2 focus:ring-forest-green resize-y"
        />
      </div>

      <div className="mb-6">
        {imagePreview ? (
          <div className="relative inline-block">
            <img
              src={imagePreview}
              alt="Attached screenshot"
              className="max-h-56 rounded-2xl border border-mist-100"
            />
            <button
              type="button"
              onClick={removeImage}
              className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-forest-green text-warm-ivory text-sm flex items-center justify-center shadow-md hover:bg-ink-900"
              aria-label="Remove screenshot"
            >
              x
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-2xl border-2 border-dashed border-mist-100 bg-warm-ivory/45 px-4 py-6 text-sm text-ink-900/55 hover:border-forest-green hover:text-ink-900 transition-colors"
          >
            Paste a screenshot, or click to upload an image
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
        <p className="text-sm text-ink-900 mb-4">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full py-3 rounded-full bg-forest-green text-warm-ivory text-base font-bold hover:bg-ink-900 transition-colors disabled:opacity-50"
      >
        {status === "sending" ? "Sending..." : "Send to developer"}
      </button>
    </form>
  )
}
