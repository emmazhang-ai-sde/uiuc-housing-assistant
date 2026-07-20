"use client"

// The white login card, extracted from app/login/page.tsx so it can render both
// as the full /login page and inside the session-expired modal (AuthModalContext)
// without the two drifting apart. The only thing that differs between the two
// mounts is what happens on a successful verify — passed in as `onSuccess`
// (the page redirects to /card; the modal just closes itself).
import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { logEvent } from "@/lib/logEvent"

// Open registration (design-docs/post-launch/open-registration.md): the waitlist
// funnel is retired from the UI. Anyone with an allowed-domain email can sign in
// (or one-click via Google). The real gate is the Supabase "Before User Created"
// hook (restrict_signup_to_allowed_domains); every check here is UX only.
//
// This list mirrors that SQL function — keep the two in sync.
const ALLOWED_EMAIL_DOMAINS = ["gmail.com", "outlook.com"]
const EDU_DOMAIN_RE = /\.edu(\.[a-z]{2})?$/
const ALLOWED_DOMAINS_HINT = "Works with Gmail, Outlook or any school (.edu) address."
const DISALLOWED_DOMAIN_ERROR = "Use a Gmail, Outlook.com, or school (.edu) email address."

function isAllowedEmailDomain(email: string) {
  const domain = email.split("@")[1] ?? ""
  return ALLOWED_EMAIL_DOMAINS.includes(domain) || EDU_DOMAIN_RE.test(domain)
}

export function LoginCard({ onSuccess }: { onSuccess: () => void }) {
  const [emailInput, setEmailInput] = useState("")
  const [code, setCode]       = useState("")
  const [step, setStep]       = useState<"email" | "code">("email")
  const [error, setError]     = useState("")
  const [loading, setLoading] = useState(false)
  const email = emailInput.trim()

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
    if (!email) {
      setError("Enter your email address.")
      return
    }
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    if (!isValidEmail) {
      setError("Enter a valid email address.")
      return
    }
    if (!isAllowedEmailDomain(email)) {
      setError(DISALLOWED_DOMAIN_ERROR)
      return
    }

    setLoading(true)
    setError("")
    const supabase = createClient()

    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      })

      if (otpError) {
        console.error("Sign-in code request failed", otpError)
        setError(getReadableErrorMessage(
          otpError,
          "Could not send a sign-in code. Check Supabase Auth logs and custom SMTP."
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

  // Google sign-in (design-docs/post-launch/open-registration.md §4): a second
  // door for the Gmail/Workspace (incl. @illinois.edu) share of the audience.
  // No email is sent and no code is typed. The domain allowlist still applies —
  // the same "Before User Created" hook runs for OAuth signups — so a rejected
  // domain fails server-side after the round-trip. The login event for this
  // flow is logged in app/auth/callback/route.ts, not here (the browser leaves
  // this page on redirect).
  async function signInWithGoogle() {
    setLoading(true)
    setError("")
    const supabase = createClient()
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    // On success the browser redirects to Google, so this only runs on failure.
    if (oauthError) {
      console.error("Google sign-in failed", oauthError)
      setError(getReadableErrorMessage(oauthError, "Could not start Google sign-in. Try again in a moment."))
      setLoading(false)
    }
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

      // Logged here, not via onAuthStateChange — that also fires on an
      // ordinary page refresh that resumes an existing session, which isn't
      // a real login. This is the one place a login is a deliberate action.
      // The OAuth/magic-link flows log their own login in the auth callback.
      logEvent("login", { via: "email_code" })
      onSuccess()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-3xl border border-mist-100 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)] p-8 sm:p-10 w-full max-w-[480px]">
      <div className="mb-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logos/project-picture.png"
          alt="UIUC Housing AI"
          className="w-full rounded-2xl mb-6 object-cover"
        />
        <div className="text-center">
          <div className="text-2xl font-extrabold tracking-tight leading-tight text-ink-900">
            UIUC Housing AI
          </div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-neutral-500 mt-2">
            Champaign-Urbana, IL
          </div>
        </div>
      </div>

      {step === "code" ? (
        <form onSubmit={handleCodeSubmit} className="space-y-5">
          <div className="text-sm text-neutral-500 leading-relaxed">
            <p className="text-lg font-extrabold tracking-tight text-ink-900 mb-1.5">Enter your sign-in code</p>
            <p>
              We sent an 8-digit code to{" "}
              <span className="font-mono text-ink-900">{email}</span>.
            </p>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-neutral-500 block mb-2">
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
              className="w-full px-4 py-3 rounded-xl border border-neutral-200 text-center font-mono text-xl tracking-[0.35em] text-ink-900 placeholder-neutral-300 focus:outline-none focus:ring-2 focus:ring-mint-400 transition"
            />
          </div>
          {error && <p className="text-sm text-[#FF465A] leading-relaxed">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-full bg-mint-400 text-ink-900 text-sm font-bold hover:bg-[#00D68F] transition-colors disabled:opacity-50"
          >
            {loading ? "Verifying…" : "Verify code"}
          </button>
          <div className="flex items-center justify-between text-sm text-neutral-500 pt-1">
            <button
              type="button"
              onClick={sendCode}
              disabled={loading}
              className="hover:text-ink-900 transition-colors disabled:opacity-50"
            >
              Resend code
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email")
                setEmailInput("")
                setCode("")
                setError("")
              }}
              disabled={loading}
              className="hover:text-ink-900 transition-colors disabled:opacity-50"
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
        <div className="space-y-5">
          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={loading}
            className="w-full py-3 rounded-full border border-neutral-200 bg-white text-ink-900 text-sm font-bold hover:border-neutral-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2.5"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3" aria-hidden="true">
            <div className="flex-1 h-px bg-mist-100" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-500">or</span>
            <div className="flex-1 h-px bg-mist-100" />
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div>
              <div className="flex items-center w-full px-4 py-3 rounded-xl border border-neutral-200 focus-within:ring-2 focus-within:ring-mint-400 transition">
                <input
                  type="email"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value.trim().toLowerCase())}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="flex-1 min-w-0 bg-transparent text-sm text-ink-900 placeholder-neutral-400 focus:outline-none"
                />
              </div>
              <p className="text-xs text-neutral-500 leading-relaxed mt-2">{ALLOWED_DOMAINS_HINT}</p>
            </div>
            {error && <p className="text-sm text-[#FF465A] leading-relaxed">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-full bg-mint-400 text-ink-900 text-sm font-bold hover:bg-[#00D68F] transition-colors disabled:opacity-50"
            >
              {loading ? "Sending…" : "Email me a code"}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
