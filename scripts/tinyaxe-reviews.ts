// Chat reviews for the session graph (docs/plan-session-graph.md), from the
// operator's side. Run with Bun from the repo (it reads .env):
//
//   bun scripts/tinyaxe-reviews.ts seed <owner username>
//       Gives every chat of that owner a rough review from its title alone
//       (a category and a few concept words), so the session graph has a
//       shape before tiny-axe's own review (S2) exists. Replaces nothing a
//       model wrote: reviews whose model isn't "seed" are left as they are.
//   bun scripts/tinyaxe-reviews.ts list <owner username>
//   bun scripts/tinyaxe-reviews.ts clear <owner username>
//       Removes the seeded reviews (model "seed") only.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { emailFor } from "../api/_lib/accounts.js";
import { norm } from "../api/_lib/sessions.js";

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function userId(db: SupabaseClient, username: string): Promise<string> {
  const email = emailFor(username) ?? fail(`"${username}" isn't a username`);
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail(`couldn't list users: ${error.message}`);
    const user = data.users.find((u) => u.email?.toLowerCase() === email);
    if (user) return user.id;
    if (data.users.length < 1000) fail(`there's no user ${username}`);
  }
}

// A category from the words of a title, and the concepts: the title's
// longer words, minus the dull ones.
const CATEGORIES: [string, RegExp][] = [
  ["shopping", /\b(buy|price|shop|cart|order|amazon|ebay|reverb|guitar|bass|find .* (used|new)|cheap|deal)\b/i],
  ["coding", /\b(code|elixir|mix|test|bug|compile|repo|git|function|module|deploy|build|api|npm|bun)\b/i],
  ["research", /\b(search|look up|what is|how (do|does|to)|compare|learn|explain|read)\b/i],
  ["tiny-axe", /\b(tiny-?axe|graph|site|username|account|sign in|token|lobster)\b/i],
  ["writing", /\b(write|draft|email|letter|note|summar|essay|post)\b/i],
];
const DULL = new Set(
  "the a an and or to of for in on at with please lets let's can you we need want is are my our this that it go get open find out about into from".split(" "),
);

function review(title: string) {
  const category = CATEGORIES.find(([, re]) => re.test(title))?.[0] ?? "other";
  const words = norm(title)
    .replace(/[^a-z0-9 +#/-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !DULL.has(w));
  const concepts = [...new Set(words)].slice(0, 5);
  return { category, concepts, summary: title.slice(0, 200) };
}

async function main() {
  if (!url || !serviceKey) fail("SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY must be set (.env)");
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const [command, username] = process.argv.slice(2);
  if (!username) fail("usage: bun scripts/tinyaxe-reviews.ts seed|list|clear <owner username>");
  const owner = await userId(db, username);

  if (command === "seed") {
    const { data: chats, error } = await db.from("buster_ta_chats").select("id,title").eq("owner_id", owner).order("id");
    if (error) fail(error.message);
    const { data: have } = await db.from("buster_ta_reviews").select("chat_id,model").eq("owner_id", owner);
    const keep = new Set((have ?? []).filter((r) => r.model !== "seed").map((r) => r.chat_id));
    const rows = (chats ?? [])
      .filter((c) => !keep.has(c.id))
      .map((c) => ({ owner_id: owner, chat_id: c.id, ...review(c.title || ""), model: "seed", decider: null, reviewed_at: new Date().toISOString() }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await db.from("buster_ta_reviews").upsert(rows.slice(i, i + 200), { onConflict: "owner_id,chat_id" });
      if (error) fail(error.message);
    }
    console.log(`seeded ${rows.length} reviews for ${username} (${keep.size} by a model left alone)`);
  } else if (command === "list") {
    const { data, error } = await db.from("buster_ta_reviews").select("chat_id,category,concepts,model").eq("owner_id", owner).order("chat_id");
    if (error) fail(error.message);
    for (const r of data ?? []) console.log(`${r.chat_id}  ${r.category}  [${(r.concepts as string[]).join(", ")}]  ${r.model ?? ""}`);
  } else if (command === "clear") {
    const { error, count } = await db.from("buster_ta_reviews").delete({ count: "exact" }).eq("owner_id", owner).eq("model", "seed");
    if (error) fail(error.message);
    console.log(`removed ${count ?? 0} seeded reviews`);
  } else {
    fail("usage: bun scripts/tinyaxe-reviews.ts seed|list|clear <owner username>");
  }
}

await main();
