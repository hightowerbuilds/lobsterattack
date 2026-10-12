// Accounts, keys and members for tiny-axe's home (tiny-axe
// docs/plan-lobsterattack.md). Run with Bun from the repo (it reads .env:
// SUPABASE_URL or VITE_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY):
//
//   bun scripts/tinyaxe-key.ts add-user <username> [--owner <username>]
//       Makes an account; asks for its password without showing it. Without
//       --owner it's an owner (it sees its own site); with it, a viewer of
//       that owner's site.
//   bun scripts/tinyaxe-key.ts password <username>
//       Sets a new password (asked for the same way).
//   bun scripts/tinyaxe-key.ts key <owner username> [label]
//       Makes a key for tiny-axe and prints it once. Only its SHA-256 is kept.
//   bun scripts/tinyaxe-key.ts let-in <viewer username> <owner username>
//   bun scripts/tinyaxe-key.ts list <owner username>
//   bun scripts/tinyaxe-key.ts revoke <key id>
//
// People sign in with a username; Supabase Auth needs an email, so a
// username stands for <username>@users.tiny-axe.invalid (src/auth.ts), a
// domain that can never take mail.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sha256 } from "../api/_lib/tinyaxe.js";

const USERNAME = /^[a-z0-9][a-z0-9._-]{1,31}$/;
const DOMAIN = "users.tiny-axe.invalid";
const MIN_PASSWORD = 12;

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function emailFor(username: string): string {
  const name = username.trim().toLowerCase();
  if (!USERNAME.test(name)) fail(`"${username}" isn't a username: 2–32 letters, digits, ".", "_" or "-", starting with a letter or digit`);
  return `${name}@${DOMAIN}`;
}

async function userId(db: SupabaseClient, username: string): Promise<string | null> {
  const email = emailFor(username);
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail(`couldn't list users: ${error.message}`);
    const user = data.users.find((u) => u.email?.toLowerCase() === email);
    if (user) return user.id;
    if (data.users.length < 1000) return null;
  }
}

async function existing(db: SupabaseClient, username: string): Promise<string> {
  return (await userId(db, username)) ?? fail(`there's no user ${username}; make it with add-user`);
}

// Read from the terminal without showing it; from a pipe, the first line.
async function secret(prompt: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    for await (const line of console) return line;
    return "";
  }
  process.stderr.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  let typed = "";
  try {
    for await (const chunk of stdin) {
      for (const ch of chunk.toString("utf8")) {
        if (ch === "\r" || ch === "\n") return typed;
        if (ch === "\u0003") fail("\nstopped");
        if (ch === "\u007f" || ch === "\b") typed = typed.slice(0, -1);
        else typed += ch;
      }
    }
    return typed;
  } finally {
    stdin.setRawMode(false);
    stdin.pause();
    process.stderr.write("\n");
  }
}

async function newPassword(): Promise<string> {
  const first = await secret("Password: ");
  if (first.length < MIN_PASSWORD) fail(`a password needs at least ${MIN_PASSWORD} characters`);
  if (process.stdin.isTTY && (await secret("Again: ")) !== first) fail("the two didn't match");
  return first;
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
    case "add-user": {
      const [username, flag, ownerName] = args;
      if (!username || (flag !== undefined && (flag !== "--owner" || !ownerName))) {
        fail("usage: add-user <username> [--owner <username>]");
      }
      const email = emailFor(username);
      if (await userId(db, username)) fail(`${username} already exists; set a new password with: password ${username}`);
      const owner = ownerName ? await existing(db, ownerName) : null;
      const { data, error } = await db.auth.admin.createUser({
        email,
        password: await newPassword(),
        email_confirm: true,
        user_metadata: { username: username.toLowerCase() },
      });
      if (error) fail(`couldn't make ${username}: ${error.message}`);
      await letIn(db, data.user.id, owner ?? data.user.id);
      console.error(ownerName ? `${username} can sign in and see ${ownerName}'s site.` : `${username} can sign in to their own site.`);
      break;
    }

    case "password": {
      const [username] = args;
      if (!username) fail("usage: password <username>");
      const id = await existing(db, username);
      const { error } = await db.auth.admin.updateUserById(id, { password: await newPassword() });
      if (error) fail(`couldn't set it: ${error.message}`);
      console.error(`${username}'s password is changed.`);
      break;
    }

    case "key": {
      const [username, label = "tiny-axe"] = args;
      if (!username) fail("usage: key <owner username> [label]");
      const owner = await existing(db, username);
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const key = Buffer.from(bytes).toString("base64url");
      const { data, error } = await db
        .from("buster_ta_keys")
        .insert({ owner_id: owner, key_hash: await sha256(key), label })
        .select("id")
        .single();
      if (error) fail(`couldn't store the key: ${error.message}`);
      await letIn(db, owner, owner);
      console.error(`Key ${data.id} (${label}) for ${username}. It's shown only this once:`);
      console.log(key);
      break;
    }

    case "let-in": {
      const [viewer, owner] = args;
      if (!viewer || !owner) fail("usage: let-in <viewer username> <owner username>");
      await letIn(db, await existing(db, viewer), await existing(db, owner));
      console.error(`${viewer} can now see ${owner}'s site.`);
      break;
    }

    case "list": {
      const [username] = args;
      if (!username) fail("usage: list <owner username>");
      const { data, error } = await db
        .from("buster_ta_keys")
        .select("id, label, created_at, last_used_at, revoked_at")
        .eq("owner_id", await existing(db, username))
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
      fail("commands: add-user, password, key, let-in, list, revoke (see the top of this file)");
  }
}

await main();
