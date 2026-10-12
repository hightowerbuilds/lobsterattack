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
// Replies are Markdown, shown through the same safe renderer as the saved
// chats (raw HTML as text, web links only, no images); your own messages
// are shown as text.

import type { RealtimeChannel } from "@supabase/supabase-js";
import { createEffect, createSignal, For, on, onCleanup, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { renderChat } from "../api/_lib/chats/render.ts";
import { session, supabase } from "./auth.ts";

type Message = {
  id: string;
  role: "user" | "assistant";
  body: string;
  status: "pending" | "working" | "answered" | "failed";
  reply_to: string | null;
  created_at: string;
};

type Live = { text?: string; status?: string };

async function call(fn: string, body: Record<string, unknown>): Promise<any> {
  if (!supabase) throw new Error("This site isn't set up to sign in yet.");
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (!error) return data;
  // The function's own reason, when it gave one.
  const reason = await (error as { context?: Response }).context?.json?.().catch(() => null);
  throw new Error(reason?.error ?? error.message);
}

const byTime = (a: Message, b: Message) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0);

export function RemoteChat() {
  const [messages, setMessages] = createStore<Message[]>([]);
  // What tiny-axe is doing about each message it's on, and its reply so far.
  const [live, setLive] = createStore<Record<string, Live>>({});
  const [online, setOnline] = createSignal(false);
  const [channelState, setChannelState] = createSignal<"joining" | "joined" | "down">("joining");
  const [problem, setProblem] = createSignal<string | null>(null);
  const [loaded, setLoaded] = createSignal(false);
  const [text, setText] = createSignal("");
  const [sending, setSending] = createSignal(false);
  let log: HTMLDivElement | undefined;
  let input: HTMLTextAreaElement | undefined;

  const upsert = (m: Message) => {
    const at = messages.findIndex((x) => x.id === m.id);
    if (at >= 0) setMessages(at, reconcile(m));
    else setMessages([...messages, m].sort(byTime));
    // A reply ends the live one.
    if (m.role === "assistant" && m.reply_to) setLive(m.reply_to, undefined!);
  };

  const load = async () => {
    try {
      const { messages: kept } = await call("ta-remote-history", {});
      setMessages(reconcile((kept as Message[]).sort(byTime), { key: "id" }));
      setProblem(null);
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setLoaded(true);
    }
  };

  createEffect(
    on(
      () => session()?.user.id,
      (owner) => {
        if (!owner || !supabase) return;
        const client = supabase;
        let channel: RealtimeChannel | undefined;
        let gone = false;

        load();
        client.realtime.setAuth().then(() => {
          if (gone) return;
          channel = client.channel(`remote:${owner}`, { config: { private: true } });
          channel
            .on("broadcast", { event: "message" }, ({ payload }) => upsert(payload as Message))
            .on("broadcast", { event: "draft" }, ({ payload }) => setLive(payload.reply_to, (was) => ({ ...was, text: payload.text })))
            .on("broadcast", { event: "status" }, ({ payload }) => setLive(payload.reply_to, (was) => ({ ...was, status: payload.text })))
            .on("presence", { event: "sync" }, () => setOnline("tiny-axe" in channel!.presenceState()))
            .subscribe((status) => {
              if (status === "SUBSCRIBED") {
                setChannelState("joined");
                // Whatever changed while the channel was down.
                load();
              } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
                setChannelState("down");
                setOnline(false);
              }
            });
        });

        onCleanup(() => {
          gone = true;
          if (channel) client.removeChannel(channel);
        });
      },
    ),
  );

  // Follow the conversation down, unless you've scrolled up to read.
  let pinned = true;
  createEffect(
    on(
      () => [messages.length, JSON.stringify(live)],
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
    try {
      const { message } = await call("ta-remote-send", { body });
      upsert(message as Message);
      setText("");
      setProblem(null);
      pinned = true;
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setSending(false);
      input?.focus();
    }
  };

  const replyTo = (id: string) => messages.find((m) => m.role === "assistant" && m.reply_to === id);

  const waiting = (m: Message) => {
    if (m.status === "pending") return online() ? "sent; tiny-axe will pick it up in a moment" : "waiting for tiny-axe to be back";
    if (m.status === "failed" && !replyTo(m.id)) return "tiny-axe couldn't answer this";
    // Taken up, then tiny-axe went away: it won't run it again on its own.
    if (m.status === "working" && !online()) return "tiny-axe went offline while working on this; send it again once it's back";
    return null;
  };

  return (
    <div class="chat-box" aria-label="Chat with tiny-axe">
      <div class="chat-status">
        <span classList={{ "online-dot": true, on: online() }} aria-hidden="true" />
        <span>
          {online()
            ? "tiny-axe is online"
            : channelState() === "joining"
              ? "connecting…"
              : channelState() === "down"
                ? "not connected; trying again"
                : "tiny-axe is offline: messages wait until it's back (/remote on in tiny-axe)"}
        </span>
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
          <p class="empty">Nothing yet. Ask tiny-axe something; it answers from your machine.</p>
        </Show>
        <ol class="transcript">
          <For each={messages}>
            {(m) => (
              <>
                <li class={`message ${m.role}`} classList={{ failed: m.status === "failed" }}>
                  <div class="who">{m.role === "user" ? "You" : "tiny-axe"}</div>
                  <Show when={m.role === "assistant"} fallback={<div class="body plain">{m.body}</div>}>
                    <div class="body" innerHTML={renderChat(m.body)} />
                  </Show>
                  <Show when={m.role === "user" && waiting(m)}>{(why) => <div class="note">{why()}</div>}</Show>
                </li>
                <Show when={m.role === "user" && m.status === "working" && online() && !replyTo(m.id)}>
                  <li class="message assistant live" aria-live="polite">
                    <div class="who">tiny-axe</div>
                    <Show when={live[m.id]?.status}>{(s) => <div class="activity">{s()}</div>}</Show>
                    <Show when={live[m.id]?.text} fallback={<div class="body thinking">…</div>}>
                      {(t) => <div class="body" innerHTML={renderChat(t())} />}
                    </Show>
                  </li>
                </Show>
              </>
            )}
          </For>
        </ol>
      </div>
      <Show when={problem()}>{(p) => <p class="problem chat-problem">{p()}</p>}</Show>
      <form class="chat-send" onSubmit={send}>
        <textarea
          ref={input}
          rows={1}
          placeholder="Ask tiny-axe…"
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
