import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const anonKey =
  process.env.SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

if (!url) throw new Error("Missing SUPABASE_URL env var");
if (!anonKey) throw new Error("Missing SUPABASE anon/publishable key env var");

/**
 * Create a fresh anon-key Supabase client per request.
 *
 * Unlike the service-role client, this respects Row Level Security. It is used
 * to verify a caller's email + password (`signInWithPassword`) and then perform
 * RLS-scoped writes as that authenticated user — so the API write path enforces
 * the same ownership rules as the browser.
 *
 * A new instance per call avoids auth-state bleeding across concurrent requests.
 */
export function createAnonClient() {
  return createClient(url!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
