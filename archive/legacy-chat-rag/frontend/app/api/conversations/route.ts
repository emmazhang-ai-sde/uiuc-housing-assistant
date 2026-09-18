// [Step 2] Bridge routes between the frontend and Supabase — the frontend
// never talks to Supabase directly. See design-docs/agent-implementation-steps/step-2-database-api-routes.md#22--nextjs-api-routes
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// GET /api/conversations
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // No dev mock: returning a fake response when the session is briefly null is
  // what produced ghost conversations. proxy.ts keeps the token fresh, so a
  // logged-in user always resolves here; a real 401 is the correct failure.
  if (!user) return NextResponse.json([], { status: 401 })

  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false })

  if (error) {
    console.error("GET /api/conversations failed:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data ?? [])
}

// POST /api/conversations
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: user.id, title: "New conversation" })
    .select("id")
    .single()

  if (error) {
    // Surface the full PostgREST error, not just .message — some failures
    // (e.g. a grant/RLS rejection wrapped oddly) come back with an empty
    // message, which JSON.stringify drops entirely, leaving the client a
    // useless "{}". code/details/hint stay populated and identify the cause.
    console.error("POST /api/conversations failed:", error)
    return NextResponse.json(
      { error: error.message || "insert failed", code: error.code, details: error.details, hint: error.hint },
      { status: 500 }
    )
  }
  if (!data?.id) {
    console.error("POST /api/conversations: insert returned no row", { data })
    return NextResponse.json({ error: "insert returned no row", data }, { status: 500 })
  }
  return NextResponse.json(data)
}
