import { NextRequest, NextResponse } from "next/server"

// Restrict to known property image domains to prevent SSRF
const ALLOWED_HOSTNAMES = new Set([
  "ugroupcu.com",
  "www.ugroupcu.com",
  "greenstrealty.com",
  "www.greenstrealty.com",
])

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url")
  if (!raw) return new NextResponse("Missing url param", { status: 400 })

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return new NextResponse("Invalid URL", { status: 400 })
  }

  if (!ALLOWED_HOSTNAMES.has(parsed.hostname)) {
    return new NextResponse("Domain not allowed", { status: 403 })
  }

  try {
    const upstream = await fetch(raw, {
      headers: { "User-Agent": "Mozilla/5.0" },
    })
    if (!upstream.ok) {
      return new NextResponse("Upstream fetch failed", { status: 502 })
    }
    const buffer = await upstream.arrayBuffer()
    const contentType = upstream.headers.get("content-type") ?? "image/jpeg"
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, immutable",
      },
    })
  } catch {
    return new NextResponse("Proxy error", { status: 502 })
  }
}
