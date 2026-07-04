// [Step 2] Bridge route between the frontend and Supabase — the frontend
// never talks to Supabase directly. See design-docs/agent-implementation-steps/step-2-database-api-routes.md#22--nextjs-api-routes
import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json([], { status: 401 })

  const { data, error } = await supabase
    .from("messages")
    .select("id, role, content, metadata, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })

  if (error) {
    console.error(`GET /api/conversations/${id}/messages failed:`, error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data ?? [])
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { role, content, metadata } = await req.json()
  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id: id, role, content, metadata })
    .select("id, role, content, created_at")
    .single()

  if (error) {
    console.error(`POST /api/conversations/${id}/messages failed:`, error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
