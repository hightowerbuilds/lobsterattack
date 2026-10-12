// Signing in: a username and password, in this browser. Supabase Auth signs
// in by email, so a username stands for `<username>@users.tiny-axe.invalid`
// (a domain that can never take mail); nobody types or sees it. Accounts are
// made by the site's owner (scripts/tinyaxe-key.ts add-user; there's no
// sign-up), and an account sees anything only once the owner has let it in
// (buster_ta_members). The page sends the
// session's access token with each /api request; the public key here only
// signs in, and can't read tiny-axe's tables.

import { createClient, type Session } from "@supabase/supabase-js";
import { createSignal } from "solid-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string | undefined;

const client = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

export const configured = client !== null;

/** The signed-in session; undefined until it's known. */
export const [session, setSession] = createSignal<Session | null | undefined>(client ? undefined : null);

if (client) {
  client.auth.getSession().then(({ data }) => setSession(data.session));
  client.auth.onAuthStateChange((_event, next) => setSession(next));
}

/** Letters, digits, `.`, `_` and `-`; scripts/tinyaxe-key.ts uses the same rule. */
export const USERNAME = /^[a-z0-9][a-z0-9._-]{1,31}$/;
const DOMAIN = "users.tiny-axe.invalid";

/** Signs in; the reason it didn't, or null. */
export async function signIn(username: string, password: string): Promise<string | null> {
  if (!client) return "This site isn't set up to sign in yet.";
  const name = username.trim().toLowerCase();
  if (!USERNAME.test(name)) return "That username and password don't match.";
  const { error } = await client.auth.signInWithPassword({ email: `${name}@${DOMAIN}`, password });
  if (!error) return null;
  return error.message === "Invalid login credentials" ? "That username and password don't match." : error.message;
}

export async function signOut() {
  await client?.auth.signOut();
  setSession(null);
}

/** The current access token (refreshed first if it ran out), or null. */
export async function accessToken(): Promise<string | null> {
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}
