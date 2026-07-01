import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const search = req.nextUrl.search
  let res: Response
  try {
    res = await fetch(`${process.env.BACKEND_URL}/api/listings${search}`)
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
