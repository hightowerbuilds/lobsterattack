// Usernames. People sign in with a username and password; Supabase Auth
// needs an email, so a username stands for <username>@users.tiny-axe.invalid,
// a domain that can never take mail. Shared by the page (src/auth.ts), the
// API (/api/signup) and scripts/tinyaxe-key.ts.

/** 2–32 letters, digits, `.`, `_` or `-`, starting with a letter or digit; lowercase. */
const USERNAME = /^[a-z0-9][a-z0-9._-]{1,31}$/;
const DOMAIN = "users.tiny-axe.invalid";
const MIN_PASSWORD = 12;
/** Supabase Auth (bcrypt) uses at most 72 bytes of a password. */
const MAX_PASSWORD = 72;

export const normalize = (username: string) => username.trim().toLowerCase();

/** The email a username stands for, or null if it isn't a username. */
export function emailFor(username: string): string | null {
  const name = normalize(username);
  return USERNAME.test(name) ? `${name}@${DOMAIN}` : null;
}

/** Why a password won't do, or null. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `A password needs at least ${MIN_PASSWORD} characters.`;
  if (new TextEncoder().encode(password).length > MAX_PASSWORD) return `A password can be at most ${MAX_PASSWORD} bytes.`;
  return null;
}

/** Supabase Auth, as the account endpoints need it. Tests use a fake. */
export interface Accounts {
  /** Makes a user who can sign in at once (no email is ever sent). */
  create(email: string, username: string, password: string): Promise<{ id: string } | "taken">;
  /** The user an email and password belong to, or null. */
  verify(email: string, password: string): Promise<string | null>;
  /** Removes a user made a moment ago, when the rest of signing up failed. */
  remove(id: string): Promise<void>;
  /** A one-time token that signs the user in (Supabase's magic-link token,
   * made without sending any email), for tiny-axe to open the site with. */
  signinToken(id: string): Promise<string>;
}
