import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAdminEmails, isAdminEmail } from "@/lib/adminEmails"
import { NextResponse } from "next/server"

// GET /api/admin/feedback — reads submitted ratings/reports for the developer.
// Same admin gate as the activity dashboard. Screenshot paths are turned into
// short-lived signed URLs (the bucket is private).
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const adminEmails = getAdminEmails()

  if (!user) return NextResponse.json({ error: "forbidden", reason: "not_logged_in" }, { status: 403 })
  if (adminEmails.size === 0) return NextResponse.json({ error: "forbidden", reason: "admin_email_env_missing" }, { status: 403 })
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: "forbidden", reason: "email_mismatch" }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("feedback_with_email")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300)

  if (error) {
    console.error("GET /api/admin/feedback failed:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Sign each screenshot path so the private bucket is viewable in the dashboard.
  const rows = await Promise.all(
    (data ?? []).map(async row => {
      let image_url: string | null = null
      if (row.image_path) {
        const { data: signed } = await admin.storage
          .from("feedback")
          .createSignedUrl(row.image_path, 60 * 60)
        image_url = signed?.signedUrl ?? null
      }
      return { ...row, image_url }
    })
  )

  return NextResponse.json({ feedback: rows })
}
