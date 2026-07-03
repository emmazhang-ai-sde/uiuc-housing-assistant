import type { MetadataRoute } from "next"

// Keeps the whole site out of search results until LAUNCH_MODE flips to
// "live" — otherwise crawlers can index gated pages (e.g. /login) even
// though proxy.ts already redirects unauthenticated visitors away from them.
export default function robots(): MetadataRoute.Robots {
  const launchMode = process.env.LAUNCH_MODE ?? "live"
  return launchMode === "live"
    ? { rules: { userAgent: "*", allow: "/" } }
    : { rules: { userAgent: "*", disallow: "/" } }
}
