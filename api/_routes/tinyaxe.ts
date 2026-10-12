import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { Accounts } from "../_lib/accounts.js";
import type { Store } from "../_lib/store.js";
import { loadChat, loadChats, sha256 } from "../_lib/tinyaxe.js";
import { chatDetail, chatList } from "../_lib/chats/views.js";
import { mcp } from "./mcp.js";

// tiny-axe's home: its chat history, shown to the people its owner lets in
// (tiny-axe docs/plan-lobsterattack.md).
//
// Two ways in, both `Authorization: Bearer …`:
//   /api/mcp   tiny-axe, with its agent key (buster_ta_keys holds only the hash)
//   /api/*     the site's pages, with a signed-in viewer's Supabase access token;
//              the viewer must be in buster_ta_members, which says whose site
//              they see. Signing in alone isn't enough: the Supabase project is
//              shared with other apps and their users.

export interface Deps {
  store: () => Store;
  /** The Supabase user an access token belongs to, or null. */
  verifyViewer: (token: string) => Promise<string | null>;
  /** Supabase Auth, for signin_link. */
  accounts?: () => Accounts;
}

type Env = { Variables: { owner: string } };

const CHANGED_LIMIT = 500;

export function tinyAxeApi(deps: Deps) {
  const api = new Hono<Env>();

  api.use("/mcp", async (c, next) => {
    const key = bearer(c);
    const owner = key && key.length >= 32 ? await deps.store().ownerForKey(await sha256(key)) : null;
    if (!owner) return c.json({ error: "A valid tiny-axe key is needed: Authorization: Bearer <key>" }, 401);
    c.set("owner", owner);
    await next();
  });
  api.route("/mcp", mcp(deps));

  const viewer = createMiddleware<Env>(async (c, next) => {
    const token = bearer(c);
    const user = token ? await deps.verifyViewer(token) : null;
    if (!user) return c.json({ error: "Sign in to see this." }, 401);
    const owner = await deps.store().ownerForViewer(user);
    if (!owner) return c.json({ error: "This account hasn't been let in." }, 403);
    c.set("owner", owner);
    c.header("Cache-Control", "no-store");
    await next();
  });

  api.get("/me", viewer, (c) => c.json({ ok: true }));

  api.get("/chats", viewer, async (c) =>
    c.json(chatList(await loadChats(deps.store(), c.get("owner")), c.req.query("q") ?? "")),
  );

  api.get("/chat", viewer, async (c) => {
    const chat = await loadChat(deps.store(), c.get("owner"), c.req.query("id") ?? "");
    return chat ? c.json(chatDetail(chat)) : c.json({ error: "There's no such chat in the history." }, 404);
  });

  // What the pages poll: when the chats last changed, and with `since` (the
  // last answer's time) which ones. More than CHANGED_LIMIT says `all`:
  // fetch everything.
  api.get("/changes", viewer, async (c) => {
    const store = deps.store();
    const owner = c.get("owner");
    const latest = await store.changes(owner);
    const since = c.req.query("since");
    if (!since || Number.isNaN(Date.parse(since))) return c.json(latest);
    const changed = await store.changedSince(owner, new Date(since).toISOString(), CHANGED_LIMIT + 1);
    const all = changed.chats.length > CHANGED_LIMIT;
    return c.json({ ...latest, changed: all ? { all: true } : changed });
  });

  return api;
}

function bearer(c: Context): string | null {
  const header = c.req.header("Authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() || null : null;
}
