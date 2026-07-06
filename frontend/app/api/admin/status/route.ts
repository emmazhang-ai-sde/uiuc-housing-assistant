import { createClient } from "@/lib/supabase/server"
import { isAdminEmail } from "@/lib/adminEmails"
import { NextResponse } from "next/server"

// GET /api/admin/status — "is the current signed-in user an admin?" for client
// components (e.g. the Account page's Administration section). The admin email
// set lives only in the server-side ADMIN_EMAIL env var and must never ship to
// the browser bundle, so the client cannot compute this itself — it asks here.
// Returns just { isAdmin } and never reveals which emails are admins. The real
// admin API routes (activity/feedback) re-gate independently, so a spoofed
// `true` here would only reveal the menu entry, not the data behind it.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return NextResponse.json({ isAdmin: isAdminEmail(user?.email) })
}
