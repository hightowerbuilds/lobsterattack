import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { memoryStore } from "../_lib/store.js";
import { sha256 } from "../_lib/tinyaxe.js";
import { tinyAxeApi } from "../_routes/tinyaxe.js";
import { buildVault, readNote, toGraph, type NoteFile } from "../_lib/vault/vault.js";
import { graphView } from "../_lib/vault/views.js";

// The same fixture tiny-axe's writer and viewer are checked against.
const FIXTURE = join(import.meta.dir, "fixtures", "vault");
const MANIFEST = JSON.parse(readFileSync(join(FIXTURE, ".tiny-axe", "vault.json"), "utf8"));
const FILES: NoteFile[] = readdirSync(FIXTURE)
  .filter((folder) => !folder.startsWith("."))
  .flatMap((folder) =>
    readdirSync(join(FIXTURE, folder)).map((file) => ({
      folder,
      id: file.slice(0, -3),
      text: readFileSync(join(FIXTURE, folder, file), "utf8"),
    })),
  );

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
  app.route("/", tinyAxeApi({ store: () => store, verifyViewer: async (t) => tokens[t] ?? null }));
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

describe("the vault rules, ported", () => {
  test("reading the fixture gives tiny-axe's graph.json", () => {
    const expected = JSON.parse(readFileSync(join(import.meta.dir, "fixtures", "graph.json"), "utf8"));
    expect(toGraph(buildVault(MANIFEST, FILES.map(readNote)))).toEqual(expected);
  });
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
    expect(names).toEqual(["graph_overview", "graph_search", "graph_note", "graph_link", "vault_push", "chat_push"]);
    expect((await rpc("tools/call", { name: "nope" })).body.error.code).toBe(-32602);
    expect((await rpc("resources/list")).body.error.code).toBe(-32601);
  });

  test("vault_push stores notes once, and skips what didn't change", async () => {
    const { call, store } = await setup();
    const first = (await call("vault_push", { manifest: MANIFEST, notes: FILES })).json();
    expect(first).toEqual({ written: FILES.length, unchanged: 0, refused: [] });

    const again = (await call("vault_push", { manifest: MANIFEST, notes: FILES })).json();
    expect(again).toEqual({ written: 0, unchanged: FILES.length, refused: [] });
    expect(store.notesWritten).toBe(FILES.length);

    const changed = { ...FILES[0], text: FILES[0].text + "\nMore.\n" };
    expect((await call("vault_push", { manifest: MANIFEST, notes: [changed] })).json().written).toBe(1);
  });

  test("vault_push refuses notes that aren't vault notes, and keeps the rest", async () => {
    const { call } = await setup();
    const good = FILES[0];
    const result = (
      await call("vault_push", {
        manifest: MANIFEST,
        notes: [
          good,
          { folder: "Secrets", id: "x", text: good.text },
          { folder: "Sites", id: "../etc/passwd", text: good.text },
          { folder: "Sites", id: "plain", text: "no frontmatter" },
          { folder: "Sites", id: 7 },
          good,
        ],
      })
    ).json();
    expect(result.written).toBe(1);
    expect(result.refused.map((r: any) => r.id)).toEqual(["x", "../etc/passwd", "plain", "?", good.id]);
  });

  test("vault_push refuses another schema or too many notes", async () => {
    const { call } = await setup();
    const wrong = await call("vault_push", { manifest: { schema: "tiny-axe-vault/2" }, notes: [] });
    expect(wrong.error).toBe(true);
    expect(wrong.text).toContain("tiny-axe-vault/1");

    const many = Array.from({ length: 201 }, (_, i) => ({ ...FILES[0], id: `n${i}` }));
    expect((await call("vault_push", { manifest: MANIFEST, notes: many })).error).toBe(true);
  });

  test("a card number in a note is removed before it's kept", async () => {
    const { call } = await setup();
    const site = FILES.find((f) => f.folder === "Sites")!;
    const text = site.text + "\nPaid with 4242 4242 4242 4242 on order 123-4567890.\n";
    await call("vault_push", { manifest: MANIFEST, notes: [{ ...site, text }] });
    const note = (await call("graph_note", { id: site.id })).text;
    expect(note).toContain("[card number removed]");
    expect(note).not.toContain("4242 4242");
    expect(note).toContain("123-4567890");
  });

  test("the read tools answer from what was pushed", async () => {
    const { call } = await setup();
    await call("vault_push", { manifest: MANIFEST, notes: FILES });

    expect((await call("graph_overview")).json().summary.sites).toBe(2);
    const results = (await call("graph_search", { q: "cart" })).json().results;
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toEqual({ id: expect.any(String), kind: expect.any(String), title: expect.any(String), snippet: expect.any(String) });

    const site = (await call("graph_note", { id: "shop.example" })).text;
    expect(site).toStartWith("id: shop.example\nkind: site\n");
    expect(site).toContain("Linked from:");
    expect((await call("graph_note", { id: "nope" })).error).toBe(true);
    expect((await call("graph_search", { q: " " })).error).toBe(true);
    expect((await call("graph_link", { focus: "shop.example" })).text).toBe("http://localhost/note/shop.example");
    expect((await call("graph_link", { page: "chats" })).text).toBe("http://localhost/chats");
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

  test("each key sees only its own owner's site", async () => {
    const { call } = await setup();
    await call("vault_push", { manifest: MANIFEST, notes: FILES });
    expect((await call("graph_overview", {}, OTHER_KEY)).json().summary.sites).toBe(0);
    expect((await call("graph_note", { id: "shop.example" }, OTHER_KEY)).error).toBe(true);
  });
});

describe("the site's reads", () => {
  test("need a signed-in viewer who was let in", async () => {
    const { app, view } = await setup();
    expect((await app.request("/api/vault")).status).toBe(401);
    expect((await view("/vault", "bad-token")).status).toBe(401);
    expect((await view("/vault", "token-stranger")).status).toBe(403);
    expect((await view("/me", "token-guest")).status).toBe(200);
    // The agent key isn't a viewer's login.
    expect((await view("/vault", KEY)).status).toBe(401);
  });

  test("show the same graph the local viewer drew", async () => {
    const { call, view } = await setup();
    await call("vault_push", { manifest: MANIFEST, notes: FILES });

    const graph = (await view("/graph")).body;
    expect(graph).toEqual(graphView(buildVault(MANIFEST, FILES.map(readNote))));

    const overview = (await view("/vault", "token-guest")).body;
    expect(overview.schema).toBe("tiny-axe-vault/1");
    expect(overview.folders.map((f: any) => f.name)).toEqual(["Sites", "Pages", "Controls", "Paths", "Tools", "Tasks"]);

    const note = (await view("/note?id=shop.example")).body;
    expect(note.html).toContain("<h1>");
    expect(note.backlinks.length).toBeGreaterThan(0);
    expect((await view("/note?id=nope")).status).toBe(404);
    expect((await view("/search?q=checkout")).body.results.length).toBeGreaterThan(0);
  });

  test("list chats by session, and say when anything changed", async () => {
    const { call, view } = await setup();
    expect((await view("/changes")).body).toEqual({ notes: null, chats: null });

    await call("chat_push", { chat: chat() });
    await call("chat_push", { chat: chat({ id: "20261011-160000-beef", title: "Second" }) });
    const list = (await view("/chats")).body;
    expect(list.total).toBe(2);
    expect(list.sessions[0].chats.map((c: any) => c.title)).toEqual(["Second", "What's using port 4000?"]);
    expect((await view("/chats?q=beam")).body.sessions[0].chats[0].snippet).toContain("beam.smp");
    expect((await view("/chat?id=20261011-000000-0000")).status).toBe(404);

    const before = (await view("/changes")).body;
    expect(before.chats).not.toBeNull();
    await call("vault_push", { manifest: MANIFEST, notes: FILES });
    const after = (await view("/changes")).body;
    expect(after.notes).not.toBeNull();
    expect(after.chats).toBe(before.chats);
  });
});
