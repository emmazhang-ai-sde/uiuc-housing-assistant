import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// GET /api/conversations
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json([], { status: 401 })

  const { data } = await supabase
    .from("conversations")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false })

  return NextResponse.json(data ?? [])
}

// POST /api/conversations
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data } = await supabase
    .from("conversations")
    .insert({ user_id: user.id, title: "New conversation" })
    .select("id")
    .single()

  return NextResponse.json(data)
}
