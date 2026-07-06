// Server-only. The admin/internal email set, parsed from the comma-separated
// ADMIN_EMAIL env var (e.g. "sz94@illinois.edu,shuyangzhang.cs@gmail.com").
// These accounts can reach /admin/activity AND are excluded from activity
// logging + metrics, so the founder's own testing doesn't pollute real-user
// numbers. Case-insensitive throughout.
export function getAdminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAIL ?? "")
      .split(",")
      .map(e => e.trim().toLowerCase())
      .filter(Boolean)
  )
}

// NOTE: this is effectively a SERVER-side check. ADMIN_EMAIL is not a
// NEXT_PUBLIC_ var, so `getAdminEmails()` is empty in the browser bundle and
// real admin emails resolve to false there. Client components must not call
// this to gate admin UI — ask GET /api/admin/status instead (see the Account
// page). The hardcoded "test" branch is the one case that also works client-
// side, but don't rely on that for env-configured admins.
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  // "test" is a fixed local/dev admin identity, independent of the ADMIN_EMAIL
  // env var — lets the admin account view be exercised locally without
  // provisioning a real address. Not a valid email format, so no genuine
  // Supabase signup can ever collide with it.
  if (normalized === "test") return true
  return getAdminEmails().has(normalized)
}
