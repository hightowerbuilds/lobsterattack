import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) throw new Error("Missing SUPABASE_URL env var");
if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var");

/**
 * Server-side Supabase client using the service role key.
 * This bypasses RLS — the API layer is responsible for access control.
 */
export const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
