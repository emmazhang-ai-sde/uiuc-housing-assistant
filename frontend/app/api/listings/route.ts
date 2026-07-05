import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  let token: string | undefined
  if (process.env.NODE_ENV !== "development") {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    const { data: { session } } = await supabase.auth.getSession()
    token = session?.access_token
  }

  const search = req.nextUrl.search
  const headers: Record<string, string> = {}
  if (token) headers["Authorization"] = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${process.env.BACKEND_URL}/api/listings${search}`, { headers })
  } catch {
    return NextResponse.json({ error: "Could not reach backend" }, { status: 502 })
  }

  let data: unknown
  try {
    data = await res.json()
  } catch {
    return NextResponse.json({ error: "Backend returned invalid response" }, { status: 502 })
  }

  return NextResponse.json(data, { status: res.status })
}
