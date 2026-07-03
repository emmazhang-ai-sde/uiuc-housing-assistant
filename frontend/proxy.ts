import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

export async function proxy(request: NextRequest) {
  // Skip auth in local development — Supabase free tier only allows 2 emails/hour
  if (process.env.NODE_ENV === "development") {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          list.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname
  const launchMode = process.env.LAUNCH_MODE ?? "live"
  // /about is the public marketing page — always reachable, logged in or not,
  // launched or not. /login is only public once the product is actually
  // live — during coming_soon it must fall through to the redirect below
  // like any other gated path, otherwise it's reachable (and discoverable)
  // before launch.
  const isPublic = path.startsWith("/about") ||
                   path.startsWith("/auth/callback") ||
                   path.startsWith("/coming-soon") ||
                   (path.startsWith("/login") && launchMode === "live")

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    const isApiRoute = path.startsWith("/api")
    if (launchMode !== "live" && !isApiRoute) {
      // Show the Coming Soon waitlist page IN PLACE — the address bar keeps
      // whatever page was requested (/chat, /map, /login, ...) instead of
      // bouncing to /coming-soon. Clicking a gated tab should land you on
      // that tab's URL with a "coming soon" page, not a surprise redirect.
      // API routes are excluded: each already does its own auth check and
      // returns a proper 401, rewriting would serve them this page's HTML
      // instead of JSON.
      url.pathname = "/coming-soon"
      return NextResponse.rewrite(url)
    }
    url.pathname = launchMode === "coming_soon" ? "/coming-soon" : "/login"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.png$|.*\\.svg$|.*\\.webp$|.*\\.jpg$|.*\\.jpeg$|.*\\.gif$|.*\\.ico$).*)"],
}
