import { createClient } from "@/lib/supabase/server"
import { isAdminEmail } from "@/lib/adminEmails"
import { NextResponse } from "next/server"

// POST /api/events — activity log for the /admin/activity dashboard.
// Uses the caller's own session (not the service role), so RLS enforces
// user_id = auth.uid(); a client can only ever log events as itself.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  // Admin/internal accounts (the founder's own test emails) are not logged —
  // their testing would otherwise inflate active-user and activation numbers.
  if (isAdminEmail(user.email)) return NextResponse.json({ ok: true, skipped: "admin" })

  const body = await request.json().catch(() => null)
  const eventType = body?.event_type
  if (!eventType || typeof eventType !== "string") {
    return NextResponse.json({ error: "event_type is required" }, { status: 400 })
  }

  const { error } = await supabase
    .from("events")
    .insert({ user_id: user.id, event_type: eventType, metadata: body?.metadata ?? {} })

  if (error) {
    console.error("POST /api/events failed:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
