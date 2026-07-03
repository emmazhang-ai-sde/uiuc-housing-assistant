"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Nunito_Sans } from "next/font/google"
import { createClient } from "@/lib/supabase/client"

const nunitoSans = Nunito_Sans({ subsets: ["latin"] })

type Mode = "login" | "signup"

export default function LoginPage() {
  const [mode, setMode]       = useState<Mode>("login")
  const [loginInput, setLoginInput] = useState("")
  const [code, setCode]       = useState("")
  const [step, setStep]       = useState<"email" | "code">("email")
  const [error, setError]     = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const email = getLoginEmail(loginInput)

  function switchMode(next: Mode) {
    if (next === mode) return
    setMode(next)
    setStep("email")
    setCode("")
    setError("")
  }

  function getLoginEmail(value: string) {
    const raw = value.trim().toLowerCase()
    if (!raw) return ""
    return raw.includes("@") ? raw : `${raw}@illinois.edu`
  }

  function getReadableErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message && error.message !== "{}") {
      return error.message
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof error.message === "string" &&
      error.message &&
      error.message !== "{}"
    ) {
      return error.message
    }
    return fallback
  }

  async function sendCode() {
    const normalizedInput = loginInput.trim().toLowerCase()
    if (!normalizedInput) {
      setError("Enter your email or Illinois NetID.")
      return
    }
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    if (!isValidEmail) {
      setError("Enter a valid email address.")
      return
    }

    setLoading(true)
    setError("")
    const supabase = createClient()

    try {
      if (mode === "signup") {
        const { data: onWaitlist, error: waitlistError } = await supabase.rpc(
          "is_email_on_waitlist",
          { p_email: email }
        )

        if (waitlistError) {
          console.error("Waitlist check failed", waitlistError)
          setError(getReadableErrorMessage(waitlistError, "Could not check the waitlist. Try again in a moment."))
          return
        }

        if (!onWaitlist) {
          setError("This email isn't on the beta waitlist.")
          return
        }
      }

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: mode === "signup" },
      })

      if (otpError) {
        console.error("Sign-in code request failed", otpError)
        setError(getReadableErrorMessage(
          otpError,
          mode === "login"
            ? "No account found for this email. Try Sign Up instead."
            : "Could not send a sign-in code. Check Supabase Auth logs, custom SMTP, and the Before User Created hook."
        ))
        return
      }

      setCode("")
      setStep("code")
    } finally {
      setLoading(false)
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    await sendCode()
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    const token = code.trim()
    if (!/^\d{8}$/.test(token)) {
      setError("Enter the 8-digit code from your email.")
      return
    }

    setLoading(true)
    setError("")
    const supabase = createClient()

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token,
        type: "email",
      })

      if (verifyError) {
        setError("Invalid or expired code.")
        return
      }

      router.replace("/")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`min-h-screen flex items-center justify-center bg-neutral-100 ${nunitoSans.className}`}>
      <div className="bg-white rounded-3xl shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)] p-10 w-full max-w-sm">
        <div className="mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logos/project-picture.png"
            alt="UIUC Housing Assistant"
            className="w-full rounded-2xl mb-5 object-cover"
          />
          <div className="text-center">
            <div className="font-bold text-neutral-900 text-[15px] leading-none">
              UIUC Housing Assistant
            </div>
            <div className="text-[10px] text-neutral-400 mt-1 uppercase tracking-widest font-medium">
              Champaign-Urbana, IL
            </div>
          </div>
        </div>

        {step === "email" && (
          <div className="flex gap-1 mb-6 bg-neutral-100 rounded-full p-1">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`flex-1 py-2 rounded-full text-xs font-semibold transition-colors ${
                mode === "login"
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className={`flex-1 py-2 rounded-full text-xs font-semibold transition-colors ${
                mode === "signup"
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              Sign Up
            </button>
          </div>
        )}

        {step === "code" ? (
          <form onSubmit={handleCodeSubmit} className="space-y-4">
            <div className="text-sm text-neutral-600 leading-relaxed space-y-2">
              <p className="font-semibold text-neutral-900">Enter your sign-in code</p>
              <p>
                We sent an 8-digit code to{" "}
                <span className="font-mono text-[#7B90A0]">{email}</span>.
              </p>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-neutral-400 block mb-2">
                Sign-in code
              </label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="00000000"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                className="w-full px-4 py-3 rounded-xl border border-neutral-200 text-center font-mono text-lg tracking-[0.35em] text-neutral-800 placeholder-neutral-300 focus:outline-none focus:ring-2 focus:ring-[#7B90A0]/40 transition"
              />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-700 transition-colors disabled:opacity-50"
            >
              {loading ? "Verifying…" : "Verify code"}
            </button>
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <button
                type="button"
                onClick={sendCode}
                disabled={loading}
                className="hover:text-neutral-700 disabled:opacity-50"
              >
                Resend code
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("email")
                  setCode("")
                  setError("")
                }}
                disabled={loading}
                className="hover:text-neutral-700 disabled:opacity-50"
              >
                Use a different email
              </button>
            </div>
            <p>
              <span className="sr-only">
                The code expires soon. Check your spam folder if it does not arrive.
              </span>
            </p>
          </form>
        ) : (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-neutral-400 block mb-2">
                Email
              </label>
              <input
                type="text"
                value={loginInput}
                onChange={e => setLoginInput(e.target.value.trim().toLowerCase())}
                placeholder="netid or email@example.com"
                required
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="w-full px-4 py-3 rounded-xl border border-neutral-200 text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#7B90A0]/40 transition"
              />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-700 transition-colors disabled:opacity-50"
            >
              {loading ? "Sending…" : mode === "login" ? "Send login code" : "Send sign-up code"}
            </button>
            <p className="text-xs text-neutral-400 text-center">
              {mode === "login"
                ? "Enter the email you signed up with."
                : "Enter any waitlisted email. We'll email an 8-digit code."}
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
