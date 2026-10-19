import { beforeEach, expect, mock, test } from "bun:test";
import { remoteAgent, remoteTopic } from "../supabase/functions/_shared/agents.ts";

// Exercise the deployed handlers with an in-memory Supabase boundary. Neither
// authentication nor database traffic leaves this process.
type Row = Record<string, any>;
type Handler = (request: Request) => Promise<Response>;
let rows: Row[] = [];
let databaseFailure: string | null = null;
let queried: string[] = [];
let rpcCalls: { name: string; params: Row }[] = [];
let handler: Handler;
const handlers: Record<string, Handler> = {};

function query(table: string) {
  queried.push(table);
  const result = (data: unknown) => ({ data, error: databaseFailure === table ? { message: "database unavailable" } : null });
  let matches = table === "buster_ta_remote" ? [...rows] : [];
  const builder: any = Object.assign(Promise.resolve().then(() => result(matches)), {
    select() { return builder; },
    eq(key: string, value: unknown) { matches = matches.filter(row => row[key] === value); return builder; },
    in(key: string, values: unknown[]) { matches = matches.filter(row => values.includes(row[key])); return builder; },
    lt() { return builder; },
    order() { return builder; },
    limit(count: number) { matches = matches.slice(0, count); return builder; },
    insert(row: Row) { const saved = { id: crypto.randomUUID(), ...row }; rows.push(saved); matches = [saved]; return builder; },
    single() { return Promise.resolve(result(matches[0])); },
    maybeSingle() { return Promise.resolve(result(matches[0] ?? null)); },
  });
  return builder;
}

mock.module("../supabase/functions/_shared/remote.ts", () => ({
  serve: (value: Handler) => { handler = value; },
  body: (request: Request) => request.json(),
  bearer: (request: Request) => request.headers.get("Authorization")?.slice(7),
  ownerForSession: async (token: string) => token === "owner-a" ? "owner-a" : null,
  ownerForKey: async (token: string) => token === "device-a" ? "owner-a" : null,
  json: (_request: Request, status: number, body: unknown) => Response.json(body, { status }),
  COLUMNS: "*", APPROVAL_COLUMNS: "*", MAX_BODY: 20_000,
  APPROVAL_KINDS: new Set(["tool"]), OUTCOMES: new Set(["refused"]),
  CONVERSATION: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  authClient: () => ({ auth: { verifyOtp: async () => ({ data: { session: { access_token: "session", expires_at: 2_000_000_000 } } }) } }),
  admin: {
    from: query,
    rpc: async (name: string, params: Row) => {
      rpcCalls.push({ name, params });
      return { data: { ok: true }, error: null };
    },
    auth: { admin: {
      getUserById: async () => ({ data: { user: { email: "owner@example.invalid" } } }),
      generateLink: async () => ({ data: { properties: { hashed_token: "hash" } } }),
      signOut: async () => ({}),
    } },
  },
}));

(globalThis as any).Deno = { env: { get: () => "public-key" } };
for (const name of ["token", "pending", "history", "send", "reply", "heartbeat"]) {
  await import(`../supabase/functions/ta-remote-${name}/index.ts`);
  handlers[name] = handler!;
}

await import("../supabase/functions/ta-remote-approval/index.ts");
const approvalHandler = handler!;

const call = (name: string, body: Row = {}, token = "owner-a") => handlers[name](new Request(`https://example.invalid/${name}`, {
  method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
}));

beforeEach(() => { rows = []; rpcCalls = []; databaseFailure = null; queried = []; });

test("legacy clients keep Tiny Axe's topic, and BusterClaw has a separate topic", async () => {
  expect(remoteAgent(undefined)).toBe("tiny-axe");
  expect(remoteAgent("busterclaw")).toBe("busterclaw");
  for (const invalid of [null, "", "BusterClaw", {}, 1]) expect(remoteAgent(invalid)).toBeNull();
  expect(remoteTopic("owner-a", "tiny-axe")).toBe("remote:owner-a");
  expect(remoteTopic("owner-a", "busterclaw")).toBe("remote:owner-a:busterclaw");
  const legacy = await (await call("token", {}, "device-a")).json();
  const buster = await (await call("token", { agent: "busterclaw" }, "device-a")).json();
  expect(legacy.topic).toBe("remote:owner-a");
  expect(buster.topic).toBe("remote:owner-a:busterclaw");
  expect(buster.protocol).toBe(2);
});

test("send, pending and history isolate both the account and the computer", async () => {
  const conversation = crypto.randomUUID();
  await call("send", { body: "For Tiny Axe", conversation });
  await call("send", { body: "For BusterClaw", conversation, agent: "busterclaw" });
  rows.forEach(row => { row.status = "pending"; });
  rows.push({ ...rows[1], owner_id: "owner-b", body: "Another account's message" });
  for (const endpoint of ["pending", "history"]) {
    const tiny = await (await call(endpoint, { conversation })).json();
    const buster = await (await call(endpoint, { conversation, agent: "busterclaw" })).json();
    expect(tiny.messages.map((m: Row) => m.body)).toEqual(["For Tiny Axe"]);
    expect(buster.messages.map((m: Row) => m.body)).toEqual(["For BusterClaw"]);
    if (endpoint === "history") expect(buster.approvals).toEqual([]);
  }
});

test("claims and replies pass authenticated ownership and selected agent to the atomic RPC", async () => {
  const id = crypto.randomUUID();
  for (const status of ["working", "answered", "failed"]) {
    expect((await call("reply", { id, status, body: "Answer", agent: "busterclaw", owner_id: "spoof" })).status).toBe(200);
    expect(rpcCalls.at(-1)).toEqual({ name: "buster_ta_remote_reply", params: {
      p_owner: "owner-a", p_agent: "busterclaw", p_id: id, p_status: status, p_body: "Answer",
    } });
  }
  await call("reply", { id, status: "working" });
  expect(rpcCalls.at(-1)?.params.p_agent).toBe("tiny-axe");
});

test("heartbeat only announces BusterClaw and bounds the draft", async () => {
  expect((await call("heartbeat")).status).toBe(400);
  expect(rpcCalls).toHaveLength(0);
  expect((await call("heartbeat", { agent: "busterclaw", text: "x".repeat(30_000) })).status).toBe(200);
  expect(rpcCalls[0].params.p_owner).toBe("owner-a");
  expect(rpcCalls[0].params.p_draft.length).toBe(20_000);
});

test("every endpoint refuses invalid credentials and unknown agents before reading or writing", async () => {
  for (const name of Object.keys(handlers)) {
    expect((await call(name, {}, "invalid")).status).toBe(401);
    expect((await call(name, { agent: "other" }, name === "token" ? "device-a" : "owner-a")).status).toBe(400);
  }
  expect(rows).toHaveLength(0);
  expect(rpcCalls).toHaveLength(0);
});


test("history reports database failures instead of hiding approvals or offline state", async () => {
  databaseFailure = "buster_ta_remote_approvals";
  await expect(call("history")).rejects.toThrow("database unavailable");
  databaseFailure = "buster_ta_remote_devices";
  await expect(call("history", { agent: "busterclaw" })).rejects.toThrow("database unavailable");
});

test("Tiny Axe uses presence without a redundant device-table query", async () => {
  expect((await call("history")).status).toBe(200);
  expect(queried).not.toContain("buster_ta_remote_devices");
});


test("Tiny Axe approvals cannot attach to BusterClaw messages", async () => {
  const tiny = { id: "tiny-message", owner_id: "owner-a", agent: "tiny-axe", role: "user" };
  const buster = { ...tiny, id: "buster-message", agent: "busterclaw" };
  rows.push(tiny, buster);
  const open = (message_id: string) => approvalHandler(new Request("https://example.invalid/approval", {
    method: "POST", headers: { Authorization: "Bearer device-a", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "open", kind: "tool", message_id, nonce: "preview-nonce-123456", salt: "preview-salt-123456", iterations: 100000, expires_in: 60, body: { title: "Review a tool" } }),
  }));
  expect((await open(buster.id)).status).toBe(404);
  expect((await open(tiny.id)).status).toBe(200);
});
