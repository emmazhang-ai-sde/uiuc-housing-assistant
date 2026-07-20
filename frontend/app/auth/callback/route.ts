import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isAdminEmail } from "@/lib/adminEmails"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    // Record the login here, mirroring the logEvent("login") that fires right
    // after verifyOtp in LoginCard.tsx. This callback is the sign-in moment for
    // the flows that redirect back (Google OAuth, and the magic-link fallback):
    // it only runs on a real code exchange, never on a session refresh, so it's
    // the one deliberate place to log those logins — and it can't double-count
    // the email-code flow, which verifies inline and never reaches here. A
    // logging failure must never block the redirect into the app.
    if (!error && data.user && !isAdminEmail(data.user.email)) {
      try {
        await supabase.from("events").insert({
          user_id: data.user.id,
          event_type: "login",
          metadata: { via: data.user.app_metadata?.provider ?? "callback" },
        })
      } catch (logError) {
        console.error("callback login log failed", logError)
      }
    }
  }
  return NextResponse.redirect(`${origin}/`)
}
