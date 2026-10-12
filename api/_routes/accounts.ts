import { Hono, type Context } from "hono";
import { emailFor, normalize, passwordProblem, type Accounts } from "../_lib/accounts.js";
import type { Store } from "../_lib/store.js";
import { sha256 } from "../_lib/tinyaxe.js";
import { rateLimit } from "../_middleware/rateLimit.js";

// Accounts, made from tiny-axe when it first opens (tiny-axe
// docs/plan-lobsterattack.md). No sign-in needed to reach these, so each is
// rate limited per IP, on top of the app-wide limit.
//
//   GET  /api/username?name=   whether a username is free
//   POST /api/signup           {username, password, label?} → {username, key}
//   POST /api/device           {username, password, label?} → {username, key}
//
// An account owns its own space: signing up makes it the owner of its own
// notes and chats, and gives tiny-axe a key for them, shown once.
// /api/device gives an existing account a key for another install.

export interface AccountDeps {
  store: () => Store;
  accounts: () => Accounts;
}

const MAX_LABEL = 80;

export function accountsApi(deps: AccountDeps) {
  const api = new Hono();

  api.get("/username", rateLimit({ maxTokens: 60, windowMs: 60_000 }), async (c) => {
    const name = normalize(c.req.query("name") ?? "");
    if (!emailFor(name)) {
      return c.json({ username: name, available: false, reason: "2–32 letters, digits, \".\", \"_\" or \"-\", starting with a letter or digit" });
    }
    const taken = await deps.store().usernameTaken(name);
    return c.json({ username: name, available: !taken, ...(taken ? { reason: "taken" } : {}) });
  });

  api.post("/signup", rateLimit({ maxTokens: 5, windowMs: 60 * 60_000 }), async (c) => {
    const body = await credentials(c);
    if ("error" in body) return c.json({ error: body.error }, 400);
    const { username, email, password, label } = body;
    const weak = passwordProblem(password);
    if (weak) return c.json({ error: weak }, 400);

    const store = deps.store();
    if (await store.usernameTaken(username)) return c.json({ error: "That username is taken." }, 409);

    const made = await deps.accounts().create(email, username, password);
    if (made === "taken") return c.json({ error: "That username is taken." }, 409);

    // The rest must all happen, or the account goes again so the name is free to try.
    try {
      if (!(await store.addAccount(made.id, username))) {
        await deps.accounts().remove(made.id);
        return c.json({ error: "That username is taken." }, 409);
      }
      await store.addMember(made.id, made.id, "owner");
      const key = await newKey(store, made.id, label);
      return c.json({ username, key }, 201);
    } catch (error) {
      await deps.accounts().remove(made.id).catch(() => {});
      throw error;
    }
  });

  api.post("/device", rateLimit({ maxTokens: 10, windowMs: 60 * 60_000 }), async (c) => {
    const body = await credentials(c);
    if ("error" in body) return c.json({ error: body.error }, 400);
    const { username, email, password, label } = body;
    const id = await deps.accounts().verify(email, password);
    if (!id) return c.json({ error: "That username and password don't match." }, 401);
    const store = deps.store();
    // Made before tiny-axe made accounts (scripts/tinyaxe-key.ts): it owns its own space too.
    await store.addAccount(id, username);
    await store.addMember(id, id, "owner");
    return c.json({ username, key: await newKey(store, id, label) }, 201);
  });

  return api;
}

async function credentials(c: Context) {
  let raw: any;
  try {
    raw = await c.req.json();
  } catch {
    return { error: "Send JSON: {username, password}." };
  }
  if (typeof raw?.username !== "string" || typeof raw?.password !== "string") {
    return { error: "Send JSON: {username, password}." };
  }
  const username = normalize(raw.username);
  const email = emailFor(username);
  if (!email) return { error: "A username is 2–32 letters, digits, \".\", \"_\" or \"-\", starting with a letter or digit." };
  const label =
    typeof raw.label === "string" && raw.label.trim() !== ""
      ? raw.label.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, MAX_LABEL)
      : "tiny-axe";
  return { username, email, password: raw.password as string, label };
}

async function newKey(store: Store, owner: string, label: string): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const key = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  await store.addKey(owner, await sha256(key), label);
  return key;
}
