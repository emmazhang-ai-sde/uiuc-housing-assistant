// [Step 3] Next.js proxy — forwards /api/chat requests to the Python backend.
// Auth check here ensures only logged-in users can reach the backend.
import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  let token: string | undefined
  if (process.env.NODE_ENV !== "development") {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    const { data: { session } } = await supabase.auth.getSession()
    token = session?.access_token
  }

  const body = await req.json()
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers["Authorization"] = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${process.env.BACKEND_URL}/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
  } catch {
    return NextResponse.json({ error: "Could not reach backend" }, { status: 502 })
  }

  let data: unknown
  try {
    data = await res.json()
  } catch {
    return NextResponse.json({ error: "Backend returned an invalid response", status: res.status }, { status: 502 })
  }

  return NextResponse.json(data, { status: res.status })
}
