import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Accounts } from "./accounts.js";

// Accounts in Supabase Auth: made with the service role (confirmed at once,
// so Supabase never mails the .invalid address), checked by signing in with
// the public key in a client of its own.
export function supabaseAccounts(admin: SupabaseClient): Accounts {
  return {
    async create(email, username, password) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username, made_by: "tiny-axe" },
      });
      if (error?.code === "email_exists" || error?.status === 422) return "taken";
      if (error || !data.user) throw new Error(error?.message ?? "no user");
      return { id: data.user.id };
    },

    async verify(email, password) {
      const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
      const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
      if (!url || !anon) throw new Error("Missing SUPABASE_URL or the anon key");
      const client = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      return error || !data.user ? null : data.user.id;
    },

    async remove(id) {
      await admin.auth.admin.deleteUser(id);
    },

    async signinToken(id) {
      const { data: found, error: notFound } = await admin.auth.admin.getUserById(id);
      if (notFound || !found.user?.email) throw new Error(notFound?.message ?? "no such user");
      // generateLink makes the link without mailing it; only its token is used.
      const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: found.user.email });
      if (error || !data.properties?.hashed_token) throw new Error(error?.message ?? "no token");
      return data.properties.hashed_token;
    },
  };
}
