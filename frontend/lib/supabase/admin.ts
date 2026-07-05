import { createClient } from "@supabase/supabase-js"

// Service-role client — full admin access, bypasses RLS. Server-only: never
// import this from a "use client" component, and never send the key to the
// browser. Used by /api/admin/* routes to read data RLS would otherwise hide.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
