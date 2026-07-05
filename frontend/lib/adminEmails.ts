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

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return getAdminEmails().has(email.trim().toLowerCase())
}
