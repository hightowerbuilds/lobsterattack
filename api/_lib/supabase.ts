import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let instance: SupabaseClient | null = null;

/**
 * Build the service-role client on first use. Validating env lazily (rather than
 * at module load) means importing this module never crashes the serverless
 * function at cold start — routes that don't need the service key (e.g. /health,
 * /posts) keep working even if SUPABASE_SERVICE_ROLE_KEY is absent.
 */
function build(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL env var");
  if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var");

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Server-side Supabase client using the service role key (bypasses RLS — the API
 * layer is responsible for access control). Lazily instantiated: the underlying
 * client is created on first property access, not at import time.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    instance ??= build();
    const value = Reflect.get(instance as object, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
}) as SupabaseClient;
