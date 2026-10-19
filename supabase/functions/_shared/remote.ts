// Shared by the ta-remote-* edge functions (tiny-axe docs/plan-remote-chat.md).
//
// Two ways in, both `Authorization: Bearer …`:
//   - tiny-axe's agent key, only at ta-remote-token, which swaps it for a
//     session of the key's owner;
//   - a Supabase session of a tiny-axe account (the browser after sign-in, or
//     tiny-axe with the session it got), everywhere else.
// Only the service role touches buster_ta_remote, after one of those checks.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

const url = Deno.env.get("SUPABASE_URL")!;

export const admin: SupabaseClient = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** A throwaway client for Auth calls that start a session (it's never kept). */
export function authClient(): SupabaseClient {
  return createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const ORIGINS = new Set([
  "https://www.lobsterattack.yachts",
  "https://lobsterattack.yachts",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  if (!ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(req) },
  });
}

/** Answers the browser's preflight; every call is a POST with a JSON body. */
export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
    if (req.method !== "POST") return json(req, 405, { error: "POST only" });
    try {
      return await handler(req);
    } catch (e) {
      console.error(JSON.stringify({ fn: new URL(req.url).pathname, error: String(e) }));
      return json(req, 500, { error: "Something went wrong." });
    }
  });
}

export function bearer(req: Request): string {
  const header = req.headers.get("Authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const value = await req.json();
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The owner of a tiny-axe agent key that hasn't been revoked, or null. */
export async function ownerForKey(key: string): Promise<string | null> {
  if (key.length < 32) return null;
  const { data, error } = await admin
    .from("buster_ta_keys")
    .select("id, owner_id")
    .eq("key_hash", await sha256(key))
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  await admin.from("buster_ta_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return data.owner_id;
}

/**
 * The tiny-axe account behind a session, or null: the session must be valid
 * and its user must have picked a username (this Supabase project is shared
 * with other apps, whose users are in auth.users too).
 */
export async function ownerForSession(token: string): Promise<string | null> {
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: account, error: accountError } = await admin
    .from("buster_ta_accounts")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (accountError) throw new Error(accountError.message);
  return account ? data.user.id : null;
}

export const COLUMNS = "id, agent, role, body, status, reply_to, conversation, created_at, updated_at";
/** A conversation's id, as the page sends it. */
export const CONVERSATION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MAX_BODY = 20000;

// Approvals (0011): what the page may see; the answer (with its proof) is
// only ever read back by tiny-axe, with its key.
export const APPROVAL_COLUMNS =
  "id, message_id, kind, body, nonce, salt, iterations, status, outcome, created_at, expires_at, updated_at";
export const APPROVAL_KINDS = new Set(["purchase", "tool", "model", "command"]);
export const OUTCOMES = new Set(["approved", "denied", "wrong_pin", "expired", "withdrawn", "refused"]);
