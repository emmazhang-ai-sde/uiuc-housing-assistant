import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  // [Step 2] Session refresh — MUST run on every request, dev included.
  // getUser() triggers a silent token refresh when the 1-hour access token is
  // near expiry, and setAll re-applies the rotated cookies to both the request
  // (so this request's downstream API route sees the fresh token) and the
  // response (so the browser stores it).
  //
  // Previously this was skipped entirely in development. That was wrong: with no
  // refresh, the access token expired after an hour and each API route tried to
  // refresh ad-hoc, so concurrent routes raced on Supabase's *rotating* refresh
  // token — some got a valid user, some got null. A null user made the routes
  // fall back to their dev mock, which returns a fake conversation id without
  // writing a row, so every message insert then failed the messages RLS check
  // (conversation_id references a row that never existed). Refreshing here keeps
  // the token fresh so getUser() in the routes is consistent. (Token refresh does
  // not send email — only magic-link sign-in hits the 2-emails/hour quota.)
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

  // In local dev, refresh the session (above) but skip the launch-mode gating
  // below so /chat and friends stay reachable without the pre-launch flow.
  if (process.env.NODE_ENV === "development") {
    return supabaseResponse
  }

  const path = request.nextUrl.pathname
  const launchMode = process.env.LAUNCH_MODE ?? "live"
  // Only the pre-launch lockout still uses the /coming-soon page. Every
  // launched mode ("live", "open") has retired the waitlist funnel — see
  // design-docs/post-launch/open-registration.md.
  const isPreLaunch = launchMode === "coming_soon"

  // The waitlist page is no longer public once launched: redirect /coming-soon
  // to /login so stale "join the waitlist" links still land somewhere useful.
  if (!isPreLaunch && path.startsWith("/coming-soon")) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  // /about is the public marketing page — always reachable, logged in or not,
  // launched or not. /api/status must be public for the same reason: it feeds
  // the listing/property counts in /about's stats band, so gating it left a
  // logged-out visitor's counts stuck on their "…" placeholder (the redirect
  // returns the login page's HTML, which fails the fetch's res.json()). It
  // carries no user data and needs no backend token — see app/api/status/route.ts.
  // /login is public once launched; during the pre-launch lockout it must fall
  // through to the rewrite below like any other gated path, otherwise it's
  // reachable (and discoverable) before launch. /coming-soon is only public
  // during the pre-launch lockout (above, it redirects away in every launched mode).
  const isPublic = path.startsWith("/about") ||
                   path.startsWith("/api/status") ||
                   path.startsWith("/auth/callback") ||
                   (isPreLaunch && path.startsWith("/coming-soon")) ||
                   (!isPreLaunch && path.startsWith("/login"))

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    const isApiRoute = path.startsWith("/api")
    if (isPreLaunch && !isApiRoute) {
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
    url.pathname = isPreLaunch ? "/coming-soon" : "/login"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.png$|.*\\.svg$|.*\\.webp$|.*\\.jpg$|.*\\.jpeg$|.*\\.gif$|.*\\.ico$).*)"],
}
