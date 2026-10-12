// Keys and members for tiny-axe's home (tiny-axe docs/plan-lobsterattack.md).
// Run with Bun from the repo (it reads .env: SUPABASE_URL or
// VITE_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY):
//
//   bun scripts/tinyaxe-key.ts key <owner email> [label]
//       Makes a key for tiny-axe and prints it once. Only its SHA-256 is
//       stored. The owner is let in to their own site too.
//   bun scripts/tinyaxe-key.ts let-in <viewer email> <owner email>
//       Lets a signed-in person see the owner's site.
//   bun scripts/tinyaxe-key.ts list <owner email>
//   bun scripts/tinyaxe-key.ts revoke <key id>
//
// Accounts are made in the Supabase dashboard (Authentication → Users → Add
// user, "Auto Confirm User"); this only finds them.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sha256 } from "../api/_lib/tinyaxe.js";

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function userId(db: SupabaseClient, email: string): Promise<string> {
  const wanted = email.trim().toLowerCase();
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail(`couldn't list users: ${error.message}`);
    const user = data.users.find((u) => u.email?.toLowerCase() === wanted);
    if (user) return user.id;
    if (data.users.length < 1000) fail(`there's no account for ${email}; add it in the Supabase dashboard first`);
  }
}

async function letIn(db: SupabaseClient, user: string, owner: string) {
  const { error } = await db
    .from("buster_ta_members")
    .upsert({ user_id: user, owner_id: owner, role: user === owner ? "owner" : "viewer" }, { onConflict: "user_id" });
  if (error) fail(`couldn't let them in: ${error.message}`);
}

async function main() {
  if (!url || !serviceKey) fail("needs SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env");
  const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case "key": {
      const [email, label = "tiny-axe"] = args;
      if (!email) fail("usage: key <owner email> [label]");
      const owner = await userId(db, email);
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const key = Buffer.from(bytes).toString("base64url");
      const { data, error } = await db
        .from("buster_ta_keys")
        .insert({ owner_id: owner, key_hash: await sha256(key), label })
        .select("id")
        .single();
      if (error) fail(`couldn't store the key: ${error.message}`);
      await letIn(db, owner, owner);
      console.error(`Key ${data.id} (${label}) for ${email}. It's shown only this once:`);
      console.log(key);
      break;
    }

    case "let-in": {
      const [viewer, owner] = args;
      if (!viewer || !owner) fail("usage: let-in <viewer email> <owner email>");
      await letIn(db, await userId(db, viewer), await userId(db, owner));
      console.error(`${viewer} can now see ${owner}'s site.`);
      break;
    }

    case "list": {
      const [email] = args;
      if (!email) fail("usage: list <owner email>");
      const { data, error } = await db
        .from("buster_ta_keys")
        .select("id, label, created_at, last_used_at, revoked_at")
        .eq("owner_id", await userId(db, email))
        .order("created_at");
      if (error) fail(error.message);
      console.table(data);
      break;
    }

    case "revoke": {
      const [id] = args;
      if (!id) fail("usage: revoke <key id>");
      const { data, error } = await db
        .from("buster_ta_keys")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id)
        .is("revoked_at", null)
        .select("id");
      if (error) fail(error.message);
      console.error(data.length > 0 ? `Key ${id} revoked.` : `No live key ${id}.`);
      break;
    }

    default:
      fail("commands: key, let-in, list, revoke (see the top of this file)");
  }
}

await main();
