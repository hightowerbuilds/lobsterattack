import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { Accounts } from "../_lib/accounts.js";
import { memoryStore } from "../_lib/store.js";
import { accountsApi } from "../_routes/accounts.js";
import { tinyAxeApi } from "../_routes/tinyaxe.js";

// A fake Supabase Auth: users by email, with their passwords.
function fakeAccounts() {
  const users = new Map<string, { id: string; password: string }>();
  let removed = 0;
  const accounts: Accounts = {
    async create(email, _username, password) {
      if (users.has(email)) return "taken";
      const id = `user-${users.size + 1}`;
      users.set(email, { id, password });
      return { id };
    },
    async verify(email, password) {
      const user = users.get(email);
      return user && user.password === password ? user.id : null;
    },
    async remove(id) {
      for (const [email, user] of users) if (user.id === id) users.delete(email);
      removed++;
    },
    async signinToken(id) {
      return `token-for-${id}`;
    },
  };
  return { accounts, users, removed: () => removed };
}

function setup() {
  const store = memoryStore();
  const auth = fakeAccounts();
  const app = new Hono().basePath("/api");
  app.route("/", accountsApi({ store: () => store, accounts: () => auth.accounts }));
  app.route("/", tinyAxeApi({ store: () => store, verifyViewer: async () => null }));
  // Each test's requests come from its own address, so limits don't carry over.
  const ip = `10.0.0.${Math.floor(Math.random() * 250)}`;
  const post = (path: string, body: unknown) =>
    app.request(`/api${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    });
  const get = (path: string) => app.request(`/api${path}`, { headers: { "x-forwarded-for": ip } });
  return { app, store, auth, post, get };
}

const PASSWORD = "a long enough password";

describe("/api/signup", () => {
  test("makes an account that owns its own space, and a working key", async () => {
    const { post, auth, app } = setup();
    const res = await post("/signup", { username: "Luke", password: PASSWORD, label: "tiny-axe on desk" });
    expect(res.status).toBe(201);
    const { username, key } = (await res.json()) as any;
    expect(username).toBe("luke");
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(auth.users.has("luke@users.tiny-axe.invalid")).toBe(true);

    // The key reaches /api/mcp, as that account.
    const mcp = await app.request("/api/mcp", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });
    expect(mcp.status).toBe(200);
  });

  test("a taken username is refused, whatever its case", async () => {
    const { post } = setup();
    expect((await post("/signup", { username: "luke", password: PASSWORD })).status).toBe(201);
    const again = await post("/signup", { username: "LUKE", password: PASSWORD });
    expect(again.status).toBe(409);
    expect(((await again.json()) as any).error).toBe("That username is taken.");
  });

  test("bad usernames are refused before anything is made", async () => {
    const { post, auth } = setup();
    for (const username of ["a", "-luke", "luke smith", "x".repeat(33), "lüke"]) {
      expect((await post("/signup", { username, password: PASSWORD })).status).toBe(400);
    }
    expect(auth.users.size).toBe(0);
  });

  test("short or missing passwords are refused too", async () => {
    const { post, auth } = setup();
    expect((await post("/signup", { username: "luke", password: "short" })).status).toBe(400);
    expect((await post("/signup", { username: "luke", password: "x".repeat(73) })).status).toBe(400);
    expect((await post("/signup", { username: "luke" })).status).toBe(400);
    expect(auth.users.size).toBe(0);
  });

  test("if the rest of signing up fails, the new user is removed again", async () => {
    const { post, auth, store } = setup();
    store.addKey = async () => {
      throw new Error("database down");
    };
    const res = await post("/signup", { username: "luke", password: PASSWORD });
    expect(res.status).toBe(500);
    expect(auth.users.size).toBe(0);
    expect(auth.removed()).toBe(1);
  });

  test("is limited to a few a time per address", async () => {
    const { post } = setup();
    const statuses = [];
    for (let i = 0; i < 7; i++) statuses.push((await post("/signup", { username: `user${i}`, password: PASSWORD })).status);
    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });
});

describe("/api/username", () => {
  test("says whether a name is free, and why not", async () => {
    const { post, get } = setup();
    await post("/signup", { username: "luke", password: PASSWORD });
    expect(await (await get("/username?name=Luke")).json()).toEqual({ username: "luke", available: false, reason: "taken" });
    expect(await (await get("/username?name=lukeh")).json()).toEqual({ username: "lukeh", available: true });
    expect(((await (await get("/username?name=no%20spaces")).json()) as any).available).toBe(false);
  });
});

describe("/api/device", () => {
  test("gives an existing account a new key, with the right password only", async () => {
    const { post } = setup();
    const first = (await (await post("/signup", { username: "luke", password: PASSWORD })).json()) as any;

    expect((await post("/device", { username: "luke", password: "wrong password!!" })).status).toBe(401);
    const res = await post("/device", { username: "Luke", password: PASSWORD, label: "laptop" });
    expect(res.status).toBe(201);
    const second = (await res.json()) as any;
    expect(second.username).toBe("luke");
    expect(second.key).not.toBe(first.key);
  });
});
