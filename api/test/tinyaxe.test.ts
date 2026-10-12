import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { memoryStore } from "../_lib/store.js";
import { sha256 } from "../_lib/tinyaxe.js";
import { tinyAxeApi } from "../_routes/tinyaxe.js";

const KEY = "k".repeat(20) + "0123456789abcdefghijkl"; // 42 characters
const OTHER_KEY = "o".repeat(40);
const OWNER = "owner-1";

async function setup() {
  const store = memoryStore({
    keys: { [await sha256(KEY)]: OWNER, [await sha256(OTHER_KEY)]: "owner-2" },
    members: { "user-owner": OWNER, "user-guest": OWNER },
  });
  const tokens: Record<string, string> = { "token-owner": "user-owner", "token-guest": "user-guest", "token-stranger": "user-x" };
  const app = new Hono().basePath("/api");
  const accounts = {
    create: async () => ({ id: "x" }),
    verify: async () => null,
    remove: async () => {},
    signinToken: async (id: string) => `one+time/${id}`,
  };
  app.route("/", tinyAxeApi({ store: () => store, verifyViewer: async (t) => tokens[t] ?? null, accounts: () => accounts }));
  let next = 1;

  async function rpc(method: string, params: object = {}, key = KEY) {
    const res = await app.request("/api/mcp", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: next++, method, params }),
    });
    return { status: res.status, body: (await res.json()) as any };
  }

  async function call(name: string, args: object = {}, key = KEY) {
    const { body } = await rpc("tools/call", { name, arguments: args }, key);
    const text = body.result?.content?.[0]?.text;
    return { error: body.result?.isError === true, text, json: () => JSON.parse(text) };
  }

  async function view(path: string, token = "token-owner") {
    const res = await app.request(`/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: res.status, body: (await res.json()) as any };
  }

  return { app, store, rpc, call, view };
}

const chat = (over: object = {}) => ({
  version: 1,
  id: "20261011-153012-a1b2",
  session: "20261011-152900-77ff",
  title: "What's using port 4000?",
  started: "2026-10-11T15:30:12Z",
  updated: "2026-10-11T15:31:00Z",
  folder: "~/code/app",
  entries: [
    { kind: "user", text: "what's using port 4000?" },
    { kind: "meta", text: "Ran in ~/code/app: `lsof -i :4000` → exit 0" },
    { kind: "assistant", text: "**beam.smp** (pid 4242) is." },
  ],
  context: { messages: ["what reopening gives the model"] },
  ...over,
});

describe("/api/mcp", () => {
  test("needs a live key", async () => {
    const { app, rpc } = await setup();
    expect((await app.request("/api/mcp", { method: "POST", body: "{}" })).status).toBe(401);
    expect((await rpc("ping", {}, "wrong".repeat(10))).status).toBe(401);
    expect((await rpc("ping", {}, "short")).status).toBe(401);
    expect((await rpc("ping")).body).toEqual({ jsonrpc: "2.0", id: expect.any(Number), result: {} });
  });

  test("initializes, lists its tools, and takes notifications quietly", async () => {
    const { app, rpc } = await setup();
    const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t" } });
    expect(init.body.result.protocolVersion).toBe("2025-06-18");
    expect(init.body.result.capabilities.tools).toBeDefined();

    const note = await app.request("/api/mcp", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
    expect(note.status).toBe(202);

    const names = (await rpc("tools/list")).body.result.tools.map((t: any) => t.name);
    expect(names).toEqual(["chat_search", "chat_read", "site_link", "signin_link", "chat_push"]);
    expect((await rpc("tools/call", { name: "nope" })).body.error.code).toBe(-32602);
    expect((await rpc("resources/list")).body.error.code).toBe(-32601);
  });

  test("chat_push keeps what the page shows, redacted, never the context", async () => {
    const { call, store, view } = await setup();
    const token = "sk-ant-api03-" + "Ab1".repeat(10);
    const doc = chat({ entries: [...chat().entries, { kind: "user", text: `my key is ${token} and card 4242424242424242` }] });

    expect((await call("chat_push", { chat: doc })).json()).toEqual({ id: doc.id, written: true });
    expect((await call("chat_push", { chat: doc })).json()).toEqual({ id: doc.id, written: false });

    const kept = JSON.stringify(await store.chat(OWNER, doc.id));
    expect(kept).not.toContain("context");
    expect(kept).not.toContain("reopening");
    expect(kept).not.toContain(token);
    expect(kept).not.toContain("4242424242424242");

    const shown = (await view(`/chat?id=${doc.id}`)).body;
    expect(shown.entries.at(-1).text).toBe("my key is [token removed] and card [card number removed]");
    expect(shown.entries[0].html).toContain("port 4000");

    expect((await call("chat_push", { chat: { ...doc, id: "../x" } })).error).toBe(true);
    expect((await call("chat_push", { chat: { ...doc, version: 2 } })).error).toBe(true);
  });

  test("chat_search finds the chats with every word, newest first, as the list does", async () => {
    const { call } = await setup();
    await call("chat_push", { chat: chat() });
    await call("chat_push", {
      chat: chat({
        id: "20261012-090000-beef",
        session: "20261012-085900-0001",
        title: "Port again",
        started: "2026-10-12T09:00:00Z",
        updated: "2026-10-12T09:05:00Z",
        entries: [{ kind: "user", text: "is **beam** still on port 4000?" }],
      }),
    });

    const both = (await call("chat_search", { q: "port 4000" })).json().results;
    expect(both.map((r: any) => r.id)).toEqual(["20261012-090000-beef", "20261011-153012-a1b2"]);
    expect(both[0]).toEqual({
      id: "20261012-090000-beef",
      title: "Port again",
      started: "2026-10-12T09:00:00Z",
      updated: "2026-10-12T09:05:00Z",
      snippet: "is beam still on port 4000?",
    });
    // Every word, anywhere in the chat: "lsof" is only in an activity line.
    expect((await call("chat_search", { q: "lsof beam" })).json().results.map((r: any) => r.id)).toEqual([
      "20261011-153012-a1b2",
    ]);
    expect((await call("chat_search", { q: "port nowhere" })).json().results).toEqual([]);
    expect((await call("chat_search", { q: " " })).error).toBe(true);
    expect((await call("chat_search", {})).error).toBe(true);
  });

  test("chat_search gives at most 20", async () => {
    const { call } = await setup();
    for (let i = 0; i < 25; i++) {
      const id = `20261011-1600${String(i).padStart(2, "0")}-beef`;
      await call("chat_push", { chat: chat({ id, updated: `2026-10-11T16:00:${String(i).padStart(2, "0")}Z` }) });
    }
    const results = (await call("chat_search", { q: "beam" })).json().results;
    expect(results.length).toBe(20);
    expect(results[0].id).toBe("20261011-160024-beef");
  });

  test("chat_read gives a chat as plain text, without the activity, cut when long", async () => {
    const { call } = await setup();
    await call("chat_push", { chat: chat() });
    const read = await call("chat_read", { id: "20261011-153012-a1b2" });
    expect(read.error).toBe(false);
    expect(read.text).toBe(
      [
        "title: What's using port 4000?",
        "id: 20261011-153012-a1b2",
        "started: 2026-10-11T15:30:12Z",
        "updated: 2026-10-11T15:31:00Z",
        "folder: ~/code/app",
        "",
        "user: what's using port 4000?",
        "",
        "tiny-axe: **beam.smp** (pid 4242) is.",
      ].join("\n"),
    );
    expect(read.text).not.toContain("lsof");

    await call("chat_push", {
      chat: chat({ id: "20261011-170000-0000", entries: [{ kind: "assistant", text: "word ".repeat(6000) }] }),
    });
    const long = (await call("chat_read", { id: "20261011-170000-0000" })).text;
    expect(long.length).toBeLessThan(20_200);
    expect(long).toContain("[cut: the chat is");

    expect((await call("chat_read", { id: "20261011-000000-0000" })).error).toBe(true);
    expect((await call("chat_read", {})).error).toBe(true);
  });

  test("site_link: the chat list, or one chat, without a token", async () => {
    const { call } = await setup();
    expect((await call("site_link")).text).toBe("http://localhost/chats");
    expect((await call("site_link", { chat: "20261011-153012-a1b2" })).text).toBe("http://localhost/chats/20261011-153012-a1b2");
    expect((await call("site_link", { chat: "../x" })).error).toBe(true);
  });

  test("signin_link: a one-time sign-in in the link's fragment, for the key's owner", async () => {
    const { call } = await setup();
    expect((await call("signin_link")).text).toBe("http://localhost/chats#signin=one%2Btime%2Fowner-1");
    expect((await call("signin_link", { chat: "20261011-153012-a1b2" })).text).toBe(
      "http://localhost/chats/20261011-153012-a1b2#signin=one%2Btime%2Fowner-1",
    );
    expect((await call("signin_link", { chat: "nope" })).error).toBe(true);
    expect((await call("signin_link", {}, OTHER_KEY)).text).toEndWith("#signin=one%2Btime%2Fowner-2");
  });

  test("each key sees only its own owner's chats", async () => {
    const { call } = await setup();
    await call("chat_push", { chat: chat() });
    expect((await call("chat_search", { q: "beam" }, OTHER_KEY)).json().results).toEqual([]);
    expect((await call("chat_read", { id: "20261011-153012-a1b2" }, OTHER_KEY)).error).toBe(true);
  });
});

describe("the site's reads", () => {
  test("need a signed-in viewer who was let in", async () => {
    const { app, view } = await setup();
    expect((await app.request("/api/chats")).status).toBe(401);
    expect((await view("/chats", "bad-token")).status).toBe(401);
    expect((await view("/chats", "token-stranger")).status).toBe(403);
    expect((await view("/me", "token-guest")).status).toBe(200);
    // The agent key isn't a viewer's login.
    expect((await view("/chats", KEY)).status).toBe(401);
  });

  test("list chats by session, and say when anything changed", async () => {
    const { call, view } = await setup();
    expect((await view("/changes")).body).toEqual({ chats: null });

    await call("chat_push", { chat: chat() });
    await call("chat_push", { chat: chat({ id: "20261011-160000-beef", title: "Second" }) });
    const list = (await view("/chats")).body;
    expect(list.total).toBe(2);
    expect(list.sessions[0].chats.map((c: any) => c.title)).toEqual(["Second", "What's using port 4000?"]);
    expect((await view("/chats?q=beam")).body.sessions[0].chats[0].snippet).toContain("beam.smp");
    expect((await view("/chat?id=20261011-000000-0000")).status).toBe(404);

    const before = (await view("/changes")).body;
    expect(before.chats).not.toBeNull();

    // Which ones, since a time.
    const since = (await view(`/changes?since=${encodeURIComponent(before.chats)}`)).body;
    expect(since.changed).toEqual({ chats: [] });
    await call("chat_push", { chat: chat({ updated: "2026-10-11T16:00:00Z" }) });
    const later = (await view(`/changes?since=${encodeURIComponent(before.chats)}`)).body;
    expect(later.changed).toEqual({ chats: ["20261011-153012-a1b2"] });
  });
});
