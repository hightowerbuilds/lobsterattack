import { batch, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { session, supabase } from "../auth.ts";
import type { Agent } from "../navigation.ts";
import { connect, type ChannelState } from "./connection.ts";
import { conversation, scope, setConversation } from "./conversation.ts";
import { chronological, mergeRows } from "./messages.ts";
import { call } from "./transport.ts";
import type { Approval, Live, Message } from "./types.ts";

/** Owns one mounted chat's state and asynchronous work, independent of its UI. */
export function createRemoteSession(target: () => Agent) {
  const name = () => target() === "busterclaw" ? "BusterClaw" : "Tiny Axe";
  const revision = createMemo(() => conversation(target()).revision);
  const context = createMemo(() => `${scope(target())}:${revision()}`);
  const [messages, setMessages] = createStore<Message[]>([]);
  const [live, setLive] = createStore<Record<string, Live | undefined>>({});
  const [approvals, setApprovals] = createStore<Approval[]>([]);
  const [online, setOnline] = createSignal(false);
  const [channelState, setChannelState] = createSignal<ChannelState>("joining");
  const [problem, setProblem] = createSignal<string | null>(null);
  const [loaded, setLoaded] = createSignal(false);
  const [text, setText] = createSignal("");
  const [sending, setSending] = createSignal(false);
  let held: Message[] = [];
  let disposed = false;
  let sendSequence = 0;
  onCleanup(() => { disposed = true; });

  const replies = createMemo(() => new Map(messages.filter(m => m.reply_to).map(m => [m.reply_to, m])));
  const messageIds = createMemo(() => new Set(messages.map(m => m.id)));
  const cards = createMemo(() => {
    const grouped = new Map<string | null, Approval[]>();
    for (const approval of approvals) {
      if (approval.message_id === null && approval.status !== "pending") continue;
      const group = grouped.get(approval.message_id) ?? [];
      group.push(approval);
      grouped.set(approval.message_id, group);
    }
    return grouped;
  });
  const replyTo = (id: string) => replies().get(id);
  const cardsFor = (id: string | null) => cards().get(id) ?? [];
  const latestReply = createMemo(() => messages.findLast(m => m.role === "assistant" && m.status === "answered")?.body ?? "");

  function receive(incoming: Message[]) {
    const kept: Message[] = [];
    for (const message of incoming) {
      if ((message.agent ?? "tiny-axe") !== target()) continue;
      if (message.conversation !== conversation(target()).id) {
        if (sending()) held = [...held.filter(m => m.id !== message.id), message].slice(-20);
        continue;
      }
      kept.push(message);
    }
    batch(() => {
      setMessages(reconcile(chronological(mergeRows(messages, kept)), { key: "id" }));
      for (const message of kept) {
        if (message.role === "assistant" && message.reply_to) setLive(message.reply_to, undefined);
      }
    });
  }

  const upsertApproval = (approval: Approval) => {
    const merged = mergeRows(approvals, [approval]).map(row =>
      row.id === approval.id && row.updated_at === approval.updated_at && approval.decision
        ? { ...row, decision: approval.decision } : row);
    setApprovals(reconcile(merged, { key: "id" }));
  };
  const load = async () => {
    const loading = context();
    const showing = conversation(target()).id;
    const current = () => !disposed && loading === context() && showing === conversation(target()).id;
    try {
      const result = await call("ta-remote-history", { agent: target(), ...(showing ? { conversation: showing } : {}) });
      if (!current()) return;
      batch(() => {
        if (target() === "busterclaw") setOnline(result.online === true);
        receive(result.messages ?? []);
        setApprovals(reconcile(mergeRows(approvals, result.approvals ?? []), { key: "id" }));
        setProblem(null);
      });
    } catch (error) {
      if (current()) setProblem((error as Error).message);
    } finally {
      if (current()) setLoaded(true);
    }
  };

  createEffect(on(() => [session()?.user.id, target()] as const, ([owner, chosen]) => {
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
    onCleanup(connect(supabase, owner, chosen, {
      load,
      message: message => receive([message]),
      approval: upsertApproval,
      live: (id, field, value) => {
        // Other conversations and finished replies must not accumulate drafts.
        if (typeof value === "string" && messageIds().has(id) && !replyTo(id)) {
          setLive(id, was => ({ ...was, [field]: value }));
        }
      },
      online: setOnline,
      state: setChannelState,
    }));
  }));

  createEffect(on(revision, () => {
    ++sendSequence;
    held = [];
    batch(() => {
      setMessages([]);
      setLive(reconcile({}));
      setText("");
      setSending(false);
      setProblem(null);
    });
  }, { defer: true }));

  async function send() {
    const body = text().trim();
    if (!body || sending()) return false;
    setSending(true);
    const sequence = ++sendSequence;
    const sendingContext = context();
    const showing = conversation(target()).id;
    const current = () => !disposed && sequence === sendSequence && sendingContext === context();
    try {
      const { message } = await call("ta-remote-send", { body, agent: target(), conversation: showing ?? undefined });
      if (!current() || showing !== conversation(target()).id) return false;
      if (showing === null) setConversation(message.conversation, target());
      receive([message, ...held]);
      held = [];
      if (text().trim() === body) setText("");
      setProblem(null);
      return true;
    } catch (error) {
      if (current()) setProblem((error as Error).message);
      return false;
    } finally {
      if (current()) setSending(false);
    }
  }

  const waiting = (message: Message) => {
    if (message.status === "pending") return online() ? `sent; ${name()} will pick it up in a moment` : `waiting for ${name()} to be back`;
    if (message.status === "failed" && !replyTo(message.id)) return `${name()} couldn't answer this`;
    if (message.status === "working" && !online()) return `${name()} is offline; its answer will appear when it reconnects`;
    return null;
  };

  return { messages, live, online, channelState, problem, loaded, text, setText, sending, send,
    latestReply, replyTo, cardsFor, waiting, upsertApproval, context,
    newChat: () => setConversation(null, target()) };
}

export type RemoteSession = ReturnType<typeof createRemoteSession>;
