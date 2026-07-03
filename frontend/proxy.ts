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
  // /login is only a public route once the product is actually live — during
  // coming_soon it must fall through to the redirect below like any other
  // path, otherwise it's reachable (and discoverable) before launch.
  const isPublic = path.startsWith("/auth/callback") ||
                   path.startsWith("/coming-soon") ||
                   (path.startsWith("/login") && launchMode === "live")

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = launchMode === "coming_soon" ? "/coming-soon" : "/login"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$|.*\\.webp$|.*\\.jpg$|.*\\.jpeg$|.*\\.gif$|.*\\.ico$).*)"],
}
