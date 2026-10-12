// Signing in: Supabase email + password, in this browser. Accounts are made
// by the site's owner (there's no sign-up), and an account sees anything only
// once the owner has let it in (buster_ta_members). The page sends the
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

/** Signs in; the reason it didn't, or null. */
export async function signIn(email: string, password: string): Promise<string | null> {
  if (!client) return "This site isn't set up to sign in yet.";
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (!error) return null;
  return error.message === "Invalid login credentials" ? "That email and password don't match." : error.message;
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
