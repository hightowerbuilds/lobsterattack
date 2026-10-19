// The Chat tab: talk to your tiny-axe wherever it's running (tiny-axe
// docs/plan-remote-chat.md). Nothing reaches into that machine: this page
// and tiny-axe both dial out to Supabase Realtime and meet on your private
// channel, `remote:<your id>`.
//
// Messages are kept (the ta-remote-* edge functions, buster_ta_remote), so
// one sent while tiny-axe is off waits for it. The channel brings each new
// or changed message, what tiny-axe is doing about one (`status`) and its
// reply so far (`draft`); tiny-axe's presence there is the online dot. The
// history is fetched again whenever the channel (re)joins, so nothing missed
// while it was down stays missing.
//
// The tab opens on an empty chat; the first message starts a conversation
// (0012), and "New chat" starts another. Only the conversation you're in is
// shown. It's kept while this browser tab is open, so a reload doesn't lose
// it; a new visit starts empty. Earlier conversations are in the history.
//
// Replies are Markdown, shown through the same safe renderer as the saved
// chats (raw HTML as text, web links only, no images); your own messages
// are shown as text.
//
// Approvals (tiny-axe docs/plan-chrome-purchases.md, P3): when tiny-axe
// needs a yes for something in this chat (a purchase, a tool call, sending
// to Claude, a command), it shows here as a card. Approving takes your
// approval PIN (set in tiny-axe with /remote pin) and, for a purchase, the
// exact total. The PIN never leaves this page: it's turned into a one-time
// proof for this approval, this decision and this total (PBKDF2, then
// HMAC), which tiny-axe checks on your machine. Three wrong PINs switch
// approvals off until you switch them on again at the machine.

import type { RealtimeChannel } from "@supabase/supabase-js";
import { createEffect, createSignal, For, on, onCleanup, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { renderChat } from "../api/_lib/chats/render.ts";
import { session, supabase } from "./auth.ts";
import { agent as selectedAgent, type Agent } from "./store.ts";
import { remoteTopic } from "../supabase/functions/_shared/agents.ts";

type Message = {
  id: string;
  agent?: Agent;
  role: "user" | "assistant";
  body: string;
  status: "pending" | "working" | "answered" | "failed";
  reply_to: string | null;
  /** Null for messages from before conversations. */
  conversation: string | null;
  created_at: string;
  updated_at: string;
};

type Live = { text?: string; status?: string };

type ApprovalBody = {
  title: string;
  lines?: string[];
  checks?: { ok: boolean; text: string }[];
  // A purchase: the total to type, and how it's shown.
  total?: string;
  total_text?: string;
};

type Approval = {
  id: string;
  message_id: string | null;
  kind: "purchase" | "tool" | "model" | "command";
  body: ApprovalBody;
  nonce: string;
  salt: string;
  iterations: number;
  status: "pending" | "answered" | "closed";
  decision?: string | null;
  outcome: string | null;
  created_at: string;
  expires_at: string;
};

const OUTCOMES: Record<string, string> = {
  approved: "Approved: tiny-axe went ahead.",
  denied: "Denied: tiny-axe didn't do it.",
  wrong_pin: "Wrong PIN: tiny-axe didn't do it.",
  expired: "Expired: tiny-axe didn't do it.",
  withdrawn: "No longer needed.",
  refused: "tiny-axe refused it (see its reply).",
};

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** The one-time proof tiny-axe checks: HMAC(PBKDF2(pin, salt), id|nonce|approve|total). */
async function proofFor(a: Approval, pin: string, total: string): Promise<string> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(a.salt), iterations: a.iterations },
    base,
    256,
  );
  const key = await crypto.subtle.importKey("raw", bits, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(`${a.id}|${a.nonce}|approve|${total}`)));
}

async function call(fn: string, body: Record<string, unknown>): Promise<any> {
  if (!supabase) throw new Error("This site isn't set up to sign in yet.");
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (!error) return data;
  // The function's own reason, when it gave one.
  const reason = await (error as { context?: Response }).context?.json?.().catch(() => null);
  throw new Error(reason?.error ?? error.message);
}

// Scope remembered conversations to both account and computer.
const [conversations, setConversations] = createSignal<Record<string, string | null>>({});
const scope = (target: Agent) => `remote-conversation:${session()?.user.id ?? "signed-out"}:${target}`;
function conversation(target: Agent): string | null {
  const key = scope(target);
  if (key in conversations()) return conversations()[key];
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function setConversation(id: string | null, target: Agent) {
  const key = scope(target);
  setConversations(was => ({ ...was, [key]: id }));
  try {
    if (id) sessionStorage.setItem(key, id);
    else sessionStorage.removeItem(key);
  } catch { /* Storage is a convenience. */ }
}
export const newChat = () => setConversation(null, selectedAgent());

const byTime = (a: Message, b: Message) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0);

export function RemoteChat(props: { agent: Agent }) {
  const target = () => props.agent;
  const name = () => target() === "busterclaw" ? "BusterClaw" : "Tiny Axe";
  const currentConversation = () => conversation(target());
  const currentScope = () => scope(target());

  const [messages, setMessages] = createStore<Message[]>([]);
  // What tiny-axe is doing about each message it's on, and its reply so far.
  const [live, setLive] = createStore<Record<string, Live>>({});
  const [approvals, setApprovals] = createStore<Approval[]>([]);
  const [online, setOnline] = createSignal(false);
  const [channelState, setChannelState] = createSignal<"joining" | "joined" | "down">("joining");
  const [problem, setProblem] = createSignal<string | null>(null);
  const [loaded, setLoaded] = createSignal(false);
  const [text, setText] = createSignal("");
  const [sending, setSending] = createSignal(false);
  let log: HTMLDivElement | undefined;
  let input: HTMLTextAreaElement | undefined;
  // Messages from the channel for a conversation the page doesn't know yet:
  // the one a send is starting, until its answer says which it is.
  let held: Message[] = [];
  let disposed = false;
  let loadSequence = 0;
  onCleanup(() => { disposed = true; });

  const upsert = (m: Message) => {
    if ((m.agent ?? "tiny-axe") !== target()) return;
    if (m.conversation !== currentConversation()) {
      if (sending()) held = [...held.filter((h) => h.id !== m.id), m].slice(-20);
      return;
    }
    const at = messages.findIndex((x) => x.id === m.id);
    if (at >= 0) {
      if (m.updated_at >= messages[at].updated_at) setMessages(at, reconcile(m));
    }
    else setMessages([...messages, m].sort(byTime));
    // A reply ends the live one.
    if (m.role === "assistant" && m.reply_to) setLive(m.reply_to, undefined!);
  };

  const upsertApproval = (a: Approval) => {
    const at = approvals.findIndex((x) => x.id === a.id);
    if (at >= 0) setApprovals(at, reconcile(a));
    else setApprovals([...approvals, a]);
  };

  const load = async () => {
    const sequence = ++loadSequence;
    const showing = currentConversation();
    const loadingScope = currentScope();
    const current = () => !disposed && sequence === loadSequence && showing === currentConversation() && loadingScope === currentScope();
    try {
      // Without a conversation there's nothing to show yet but the approvals.
      const { messages: kept, approvals: asked, online: connected } = await call("ta-remote-history", { agent: target(), ...(showing ? { conversation: showing } : {}) });
      if (!current()) return;
      if (target() === "busterclaw") setOnline(connected === true);
      // Keep broadcasts received while this history snapshot was in flight.
      for (const message of (kept ?? []) as Message[]) upsert(message);
      setApprovals(reconcile((asked ?? []) as Approval[], { key: "id" }));
      setProblem(null);
    } catch (e) {
      if (current()) setProblem((e as Error).message);
    } finally {
      if (current()) setLoaded(true);
    }
  };

  createEffect(
    on(
      () => [session()?.user.id, target()] as const,
      ([owner, chosen]) => {
        setMessages([]);
        setLive(reconcile({}));
        setApprovals([]);
        setOnline(false);
        setLoaded(false);
        setText("");
        setSending(false);
        setProblem(null);
        setChannelState("joining");
        held = [];
        if (!owner || !supabase) return;
        const client = supabase;
        let channel: RealtimeChannel | undefined;
        let gone = false;

        load();
        client.realtime.setAuth().then(() => {
          if (gone) return;
          channel = client.channel(remoteTopic(owner, chosen), { config: { private: true } });
          channel
            .on("broadcast", { event: "message" }, ({ payload }) => { if (!gone) upsert(payload as Message); })
            .on("broadcast", { event: "approval" }, ({ payload }) => { if (!gone && chosen === "tiny-axe") upsertApproval(payload as Approval); })
            .on("broadcast", { event: "draft" }, ({ payload }) => { if (!gone) setLive(payload.reply_to, (was) => ({ ...was, text: payload.text })); })
            .on("broadcast", { event: "status" }, ({ payload }) => { if (!gone) setLive(payload.reply_to, (was) => ({ ...was, status: payload.text })); })
            .on("broadcast", { event: "device" }, ({ payload }) => { if (!gone && chosen === "busterclaw") setOnline(payload.online === true); })
            .on("presence", { event: "sync" }, () => { if (!gone && chosen === "tiny-axe") setOnline("tiny-axe" in channel!.presenceState()); })
            .subscribe((status) => {
              if (gone) return;
              if (status === "SUBSCRIBED") {
                setChannelState("joined");
                // Whatever changed while the channel was down.
                load();
              } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
                setChannelState("down");
                setOnline(false);
              }
            });
        }).catch(() => { if (!gone) setChannelState("down"); });

        const poll = setInterval(() => { if (!gone) void load(); }, 5000);
        onCleanup(() => {
          clearInterval(poll);
          gone = true;
          if (channel) client.removeChannel(channel);
        });
      },
    ),
  );

  // New chat: an empty log, and the box ready to type in.
  createEffect(
    on(
      currentConversation,
      (now) => {
        if (now !== null) return;
        setMessages([]);
        setLive(reconcile({}));
        setProblem(null);
        input?.focus();
      },
      { defer: true },
    ),
  );

  // Follow the conversation down, unless you've scrolled up to read.
  let pinned = true;
  createEffect(
    on(
      () => [messages.length, approvals.length, JSON.stringify(live)],
      () => {
        if (log && pinned) queueMicrotask(() => (log!.scrollTop = log!.scrollHeight));
      },
    ),
  );

  const send = async (e: Event) => {
    e.preventDefault();
    const body = text().trim();
    if (!body || sending()) return;
    setSending(true);
    const sendingScope = currentScope();
    const sendingConversation = currentConversation();
    const current = () => !disposed && sendingScope === currentScope();
    try {
      const { message } = (await call("ta-remote-send", { body, agent: target(), conversation: sendingConversation ?? undefined })) as {
        message: Message;
      };
      if (!current() || sendingConversation !== currentConversation()) return;
      if (currentConversation() === null) setConversation(message.conversation, target());
      upsert(message);
      for (const m of held) upsert(m);
      held = [];
      setText("");
      setProblem(null);
      pinned = true;
    } catch (e) {
      if (current()) setProblem((e as Error).message);
    } finally {
      if (current()) {
        setSending(false);
        input?.focus();
      }
    }
  };

  // An approval for a message in this conversation, or for none while it waits.
  const cardsFor = (id: string | null) =>
    approvals.filter((a) => a.message_id === id && (id !== null || a.status === "pending"));

  const replyTo = (id: string) => messages.find((m) => m.role === "assistant" && m.reply_to === id);

  const waiting = (m: Message) => {
    if (m.status === "pending") return online() ? `sent; ${name()} will pick it up in a moment` : `waiting for ${name()} to be back`;
    if (m.status === "failed" && !replyTo(m.id)) return `${name()} couldn't answer this`;
    // Taken up, then tiny-axe went away: it won't run it again on its own.
    if (m.status === "working" && !online()) return `${name()} is offline; its answer will appear when it reconnects`;
    return null;
  };

  return (
    <div class="chat-box" aria-label={`Chat with ${name()}`}>
      <div class="chat-status">
        <span classList={{ "online-dot": true, on: online() }} aria-hidden="true" />
        <span class="chat-state">
          {online()
            ? `${name()} is online`
            : channelState() === "joining"
              ? "connecting…"
              : channelState() === "down"
                ? "not connected; trying again"
                : `${name()} is offline; messages wait until its computer reconnects`}
        </span>
        <button type="button" class="new-chat" disabled={sending() || messages.length === 0} onClick={() => setConversation(null, target())}>
          New chat
        </button>
      </div>
      <div
        class="chat-log"
        ref={log}
        onScroll={() => {
          if (log) pinned = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
        }}
      >
        <Show when={!loaded()}>
          <p class="empty">Loading…</p>
        </Show>
        <Show when={loaded() && messages.length === 0}>
          <p class="empty">A new chat with {name()}. It answers from your {target() === "busterclaw" ? "BusterClaw" : "Tiny Axe"} computer.</p>
        </Show>
        <ol class="transcript">
          <For each={messages}>
            {(m) => (
              <>
                <li class={`message ${m.role}`} classList={{ failed: m.status === "failed" }}>
                  <div class="who">{m.role === "user" ? "You" : name()}</div>
                  <Show when={m.role === "assistant"} fallback={<div class="body plain">{m.body}</div>}>
                    <div class="body" innerHTML={renderChat(m.body)} />
                  </Show>
                  <Show when={m.role === "user" && waiting(m)}>{(why) => <div class="note">{why()}</div>}</Show>
                </li>
                <For each={m.role === "user" ? cardsFor(m.id) : []}>{(a) => <ApprovalCard approval={a} onUpdate={upsertApproval} />}</For>
                <Show when={m.role === "user" && m.status === "working" && online() && !replyTo(m.id)}>
                  <li class="message assistant live" aria-live="polite">
                    <div class="who">{name()}</div>
                    <Show when={live[m.id]?.status}>{(s) => <div class="activity">{s()}</div>}</Show>
                    <Show when={live[m.id]?.text} fallback={<div class="body thinking">…</div>}>
                      {(t) => <div class="body" innerHTML={renderChat(t())} />}
                    </Show>
                  </li>
                </Show>
              </>
            )}
          </For>
          <For each={cardsFor(null)}>{(a) => <ApprovalCard approval={a} onUpdate={upsertApproval} />}</For>
        </ol>
      </div>
      <Show when={problem()}>{(p) => <p class="problem chat-problem">{p()}</p>}</Show>
      <form class="chat-send" onSubmit={send}>
        <textarea
          ref={input}
          rows={1}
          placeholder={`Ask ${name()}…`}
          maxlength={20000}
          aria-label="Message"
          value={text()}
          onInput={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => {
            // Enter sends; shift+enter is a new line.
            if (e.key === "Enter" && !e.shiftKey && !e.isComposing) send(e);
          }}
        />
        <button type="submit" class="button" disabled={sending() || !text().trim()}>
          {sending() ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}

function ApprovalCard(props: { approval: Approval; onUpdate: (a: Approval) => void }) {
  const a = () => props.approval;
  const [pin, setPin] = createSignal("");
  const [total, setTotal] = createSignal("");
  const [busy, setBusy] = createSignal<"approve" | "deny" | null>(null);
  const [problem, setProblem] = createSignal<string | null>(null);
  const [now, setNow] = createSignal(Date.now());
  const timer = setInterval(() => setNow(Date.now()), 5000);
  onCleanup(() => clearInterval(timer));

  const expired = () => a().status === "pending" && Date.parse(a().expires_at) <= now();
  const open = () => a().status === "pending" && !expired();
  const purchase = () => a().kind === "purchase";

  const answer = async (decision: "approve" | "deny") => {
    if (busy()) return;
    setProblem(null);
    if (decision === "approve") {
      if (pin().length < 6) return setProblem("Type your approval PIN (set with /remote pin in tiny-axe).");
      if (purchase() && !total().trim()) return setProblem(`Type the total, ${a().body.total ?? ""}, to buy.`);
    }
    setBusy(decision);
    try {
      const body: Record<string, unknown> = { id: a().id, decision };
      if (decision === "approve") {
        const typed = purchase() ? total().trim() : "";
        body.total = typed;
        body.proof = await proofFor(a(), pin(), typed);
      }
      const { approval } = await call("ta-remote-approve", body);
      // The answer is in; the PIN goes.
      setPin("");
      props.onUpdate({ ...(approval as Approval), decision });
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const state = () => {
    if (a().status === "closed") return OUTCOMES[a().outcome ?? ""] ?? "Closed.";
    if (a().status === "answered") return a().decision === "deny" ? "Denied; telling tiny-axe…" : "Sent; tiny-axe is checking it…";
    if (expired()) return OUTCOMES.expired;
    return null;
  };

  return (
    <li class="message approval" classList={{ purchase: purchase(), done: !open() }}>
      <div class="who">{purchase() ? "tiny-axe wants to buy" : "tiny-axe asks"}</div>
      <div class="approval-title">{a().body.title}</div>
      <For each={a().body.lines ?? []}>{(line) => <div class="approval-line">{line}</div>}</For>
      <Show when={(a().body.checks ?? []).length > 0}>
        <ul class="approval-checks">
          <For each={a().body.checks}>{(c) => <li classList={{ ok: c.ok, failed: !c.ok }}>{c.ok ? "✓" : "✗"} {c.text}</li>}</For>
        </ul>
      </Show>
      <Show when={open()} fallback={<div class="note">{state()}</div>}>
        <form
          class="approval-form"
          onSubmit={(e) => {
            e.preventDefault();
            answer("approve");
          }}
        >
          <Show when={purchase()}>
            <label>
              Type the total{a().body.total_text ? ` (${a().body.total_text})` : ""}
              <input inputmode="decimal" autocomplete="off" value={total()} onInput={(e) => setTotal(e.currentTarget.value)} />
            </label>
          </Show>
          <label>
            Approval PIN
            <input type="password" autocomplete="off" value={pin()} onInput={(e) => setPin(e.currentTarget.value)} />
          </label>
          <div class="approval-buttons">
            <button type="submit" class="button approve" disabled={busy() !== null}>
              {busy() === "approve" ? "Checking…" : purchase() ? "Buy" : "Approve"}
            </button>
            <button type="button" class="button" disabled={busy() !== null} onClick={() => answer("deny")}>
              {busy() === "deny" ? "Denying…" : "Deny"}
            </button>
          </div>
          <div class="note">
            Waits until {new Date(a().expires_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}; then it's a no.
          </div>
        </form>
      </Show>
      <Show when={problem()}>{(p) => <div class="note problem-note">{p()}</div>}</Show>
    </li>
  );
}
