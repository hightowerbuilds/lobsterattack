// Signing in: a username and password, in this browser. Supabase Auth signs
// in by email, so a username stands for `<username>@users.tiny-axe.invalid`
// (a domain that can never take mail); nobody types or sees it. Accounts are
// made in tiny-axe when it first opens (POST /api/signup), and each sees its
// own space and any it has been let in to (buster_ta_members). The page sends the
// session's access token with each /api request; the public key here only
// signs in, and can't read tiny-axe's tables.

import { createClient, type Session } from "@supabase/supabase-js";
import { createSignal } from "solid-js";
import { emailFor } from "../api/_lib/accounts.ts";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string | undefined;

// The page reads its own sign-in links (#signin=, below), not Supabase's.
const client =
  url && key
    ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })
    : null;

export const configured = client !== null;

/** The Supabase client, for the Chat tab's edge functions and Realtime channel. */
export const supabase = client;

/** The signed-in session; undefined until it's known. */
export const [session, setSession] = createSignal<Session | null | undefined>(client ? undefined : null);

/** Why a sign-in link from tiny-axe didn't work, or null. */
export const [linkProblem, setLinkProblem] = createSignal<string | null>(null);

// tiny-axe opens the site in the user's browser as `…#signin=<token>`: a
// one-time token (Supabase's magic-link token, made for the account of
// tiny-axe's key, never mailed) that signs in here. It's in the fragment, so
// it never reaches a server; it's taken out of the address bar at once, and
// using it once uses it up.
function takeSigninToken(): string | null {
  const found = /(?:^#|&)signin=([^&]+)/.exec(location.hash);
  if (!found) return null;
  history.replaceState(null, "", location.pathname + location.search);
  return decodeURIComponent(found[1]);
}

if (client) {
  const token = takeSigninToken();
  let ready = false;

  const first = token
    ? client.auth.verifyOtp({ token_hash: token, type: "magiclink" }).then(async ({ data, error }) => {
        if (!error) return data.session;
        setLinkProblem("That sign-in link from tiny-axe was used already or has run out. Sign in here, or type /graph in tiny-axe for a new one.");
        return (await client.auth.getSession()).data.session;
      })
    : client.auth.getSession().then(({ data }) => data.session);

  first.then((s) => {
    ready = true;
    setSession(s);
  });
  // Not before the first answer: a sign-in link being used shouldn't flash the sign-in page.
  client.auth.onAuthStateChange((_event, next) => {
    if (ready) setSession(next);
  });
}

/** Signs in; the reason it didn't, or null. */
export async function signIn(username: string, password: string): Promise<string | null> {
  if (!client) return "This site isn't set up to sign in yet.";
  const email = emailFor(username);
  if (!email) return "That username and password don't match.";
  const { error } = await client.auth.signInWithPassword({ email, password });
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
