// R1's real check of remote chat (tiny-axe docs/plan-remote-chat.md), against
// the deployed ta-remote-* edge functions and Supabase Realtime.
//
//   TA_KEY=… bun scripts/remote-check.ts
//
// TA_KEY is tiny-axe's agent key (from the keyring: `secret-tool lookup
// service tiny-axe key site`); nothing here prints it or any token. Two
// clients play the two ends with the session ta-remote-token hands out: the
// "machine" joins the owner's channel and shows as online; the "browser" sends
// a message, sees it picked up, gets a streamed piece, then the reply. Then the
// refusals: no session, someone else's channel, no key.
//
// It leaves one answered "remote-check" message and its reply in the owner's
// history.

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_ANON_KEY;
const key = process.env.TA_KEY;
if (!url || !anon || !key) {
  console.error("Needs SUPABASE_URL and VITE_SUPABASE_ANON_KEY (.env) and TA_KEY.");
  process.exit(2);
}

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
  if (!ok) failed++;
}

async function call(fn: string, bearer: string | null, payload: unknown = {}) {
  const res = await fetch(`${url}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      apikey: anon!,
      "Content-Type": "application/json",
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

function client(token: string | null): SupabaseClient {
  const sb = createClient(url!, anon!, { auth: { persistSession: false, autoRefreshToken: false } });
  if (token) sb.realtime.setAuth(token);
  return sb;
}

/** Joins a private channel; resolves with how the join ended. */
function join(channel: RealtimeChannel): Promise<string> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("TIMED_OUT"), 10_000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timer);
        resolve(status);
      }
    });
  });
}

async function until<T>(what: () => T | undefined, ms = 10_000): Promise<T | undefined> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = what();
    if (value !== undefined) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  return undefined;
}

// 1. The key → a session.
const minted = await call("ta-remote-token", key);
check("ta-remote-token swaps the key for a session", minted.status === 200 && !!minted.body.access_token, `HTTP ${minted.status}`);
if (minted.status !== 200) process.exit(1);
const { access_token: token, topic, expires_at } = minted.body;
check("the session has a lifetime", typeof expires_at === "number" && expires_at * 1000 > Date.now());
check("no refresh token is handed out", !("refresh_token" in minted.body));

// 2. Both ends join the owner's channel; the machine shows as online.
const machine = client(token);
const browser = client(token);
const machineSeen: any[] = [];
const browserSeen: { event: string; payload: any }[] = [];

const machineChannel = machine.channel(topic, { config: { private: true, presence: { key: "tiny-axe" } } });
machineChannel.on("broadcast", { event: "message" }, ({ payload }) => machineSeen.push(payload));

const browserChannel = browser.channel(topic, { config: { private: true, presence: { key: "browser" } } });
for (const event of ["message", "delta"]) {
  browserChannel.on("broadcast", { event }, ({ payload }) => browserSeen.push({ event, payload }));
}
let online = false;
browserChannel.on("presence", { event: "sync" }, () => {
  online = "tiny-axe" in browserChannel.presenceState();
});

check("the machine joins its owner's private channel", (await join(machineChannel)) === "SUBSCRIBED");
check("the browser joins it too", (await join(browserChannel)) === "SUBSCRIBED");
await machineChannel.track({ at: new Date().toISOString() });
check("the browser sees tiny-axe online (presence)", (await until(() => (online ? true : undefined))) === true);

// 3. The browser sends; the machine hears it.
const sent = await call("ta-remote-send", token, { body: "remote-check: ping" });
check("ta-remote-send keeps the message", sent.status === 200 && sent.body.message?.status === "pending", `HTTP ${sent.status}`);
const id = sent.body.message?.id;
check("the machine gets it on the channel", !!(await until(() => machineSeen.find((m) => m.id === id && m.status === "pending"))));

const pending = await call("ta-remote-pending", token);
check("ta-remote-pending lists it", pending.status === 200 && pending.body.messages?.some((m: any) => m.id === id));

// 4. The machine picks it up, streams a piece, answers.
const working = await call("ta-remote-reply", token, { id, status: "working" });
check("marked working", working.status === 200 && working.body.reply === null);
check("the browser sees it's working", !!(await until(() => browserSeen.find((s) => s.event === "message" && s.payload.id === id && s.payload.status === "working"))));

await machineChannel.send({ type: "broadcast", event: "delta", payload: { reply_to: id, text: "po" } });
check("the browser gets a streamed piece", !!(await until(() => browserSeen.find((s) => s.event === "delta" && s.payload.reply_to === id))));

const answered = await call("ta-remote-reply", token, { id, status: "answered", body: "remote-check: pong" });
check("ta-remote-reply keeps the reply", answered.status === 200 && answered.body.reply?.reply_to === id, `HTTP ${answered.status}`);
check("the browser gets the reply", !!(await until(() => browserSeen.find((s) => s.event === "message" && s.payload.reply_to === id))));

const again = await call("ta-remote-reply", token, { id, status: "answered", body: "twice" });
check("a message is answered only once", again.status === 409, `HTTP ${again.status}`);

const after = await call("ta-remote-pending", token);
check("it's no longer pending", after.status === 200 && !after.body.messages?.some((m: any) => m.id === id));

const history = await call("ta-remote-history", token);
check("ta-remote-history has both", history.status === 200 && history.body.messages?.filter((m: any) => m.id === id || m.reply_to === id).length === 2);

// 5. Refusals.
const stranger = client(null);
check("no session: can't join the channel", (await join(stranger.channel(topic, { config: { private: true } }))) !== "SUBSCRIBED");

const elsewhere = client(token);
const other = "remote:00000000-0000-4000-8000-000000000000";
check("someone else's channel: refused", (await join(elsewhere.channel(other, { config: { private: true } }))) !== "SUBSCRIBED");

check("ta-remote-send without a session: 401", (await call("ta-remote-send", null, { body: "x" })).status === 401);
check("ta-remote-send with the key instead of a session: 401", (await call("ta-remote-send", key, { body: "x" })).status === 401);
check("ta-remote-token with a made-up key: 401", (await call("ta-remote-token", "x".repeat(48))).status === 401);

// 6. A new session signs the old one out.
const renewed = await call("ta-remote-token", key, { previous: token });
check("ta-remote-token renews", renewed.status === 200 && renewed.body.access_token !== token);
await call("ta-remote-token", key, { previous: renewed.body.access_token });

for (const sb of [machine, browser, stranger, elsewhere]) await sb.removeAllChannels();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
