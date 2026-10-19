// Agent chat layout. State, transport, approvals and mobile controls live in
// their own modules; this component owns only DOM references and scrolling.
import { createEffect, on, onCleanup, onMount, Show } from "solid-js";
import { Axe } from "./axe.tsx";
import { Hook } from "./hook.tsx";
import { createMobileChat } from "./mobile-chat.tsx";
import { MobileChatTools } from "./mobile/tools.tsx";
import { createVisualViewer } from "./visual-viewer.tsx";
import type { Agent } from "./navigation.ts";
import { createRemoteSession } from "./remote/session.ts";
import { Transcript } from "./remote/transcript.tsx";

export function RemoteChat(props: { agent: Agent }) {
  const target = () => props.agent;
  const name = () => target() === "busterclaw" ? "BusterClaw" : "Tiny Axe";
  const chat = createRemoteSession(target);
  const visuals = createVisualViewer();
  let box: HTMLDivElement | undefined;
  let log: HTMLDivElement | undefined;
  let input: HTMLTextAreaElement | undefined;
  let pinned = true;
  let disposed = false;
  onCleanup(() => { disposed = true; });
  const mobile = createMobileChat({
    box: () => box, input: () => input, scope: chat.context,
    text: chat.text, setText: chat.setText, reply: chat.latestReply, sending: chat.sending,
  });
  const follow = () => { if (log && pinned) log.scrollTop = log.scrollHeight; };
  onMount(() => {
    // Follow actual layout changes, including image loads, without serializing
    // every streamed draft just to detect a change.
    const observer = new ResizeObserver(follow);
    const transcript = log?.querySelector(".transcript");
    if (transcript) observer.observe(transcript);
    onCleanup(() => observer.disconnect());
  });
  createEffect(on(chat.context, () => {
    visuals.close();
    pinned = true;
    input?.focus();
  }, { defer: true }));
  const send = async (event: Event) => {
    event.preventDefault();
    if (await chat.send()) { pinned = true; queueMicrotask(follow); }
    if (!disposed) input?.focus();
  };

  return (
    <div ref={el => { box = el; }} class="chat-box" classList={{ "chat-expanded": mobile.expanded() }} aria-label={`Chat with ${name()}`}>
      <div class="chat-status">
        <span classList={{ "online-dot": true, on: chat.online() }} aria-hidden="true" />
        <span class="chat-state">
          {chat.online()
            ? `${name()} is online`
            : chat.channelState() === "joining"
              ? "connecting…"
              : chat.channelState() === "down"
                ? "not connected; trying again"
                : `${name()} is offline; messages wait until its computer reconnects`}
        </span>
        <button type="button" class="new-chat" disabled={chat.sending() || chat.messages.length === 0} onClick={chat.newChat}>
          New chat
        </button>
        <Show when={mobile.expanded()}>
          <button type="button" class="close-expanded" aria-label="Close full screen" onClick={() => mobile.close()}>✕</button>
        </Show>
      </div>
      <div
        class="chat-log"
        ref={el => { log = el; }}
        onClick={visuals.openFromClick}
        onScroll={() => {
          if (log) pinned = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
        }}
      >
        <Show when={!chat.loaded()}>
          <p class="empty">Loading…</p>
        </Show>
        <Show when={chat.loaded() && chat.messages.length === 0}>
          <p class="empty">A new chat with {name()}. It answers from your {target() === "busterclaw" ? "BusterClaw" : "Tiny Axe"} computer.</p>
        </Show>
        <Transcript chat={chat} name={name} />
      </div>
      <Show when={chat.problem()}>{(p) => <p class="problem chat-problem">{p()}</p>}</Show>
      <MobileChatTools controls={mobile} canRead={!!chat.latestReply().trim()} sending={chat.sending()} />
      <form class="chat-send" onSubmit={send}>
        <textarea
          ref={el => { input = el; }}
          rows={1}
          placeholder={`Ask ${name()}…`}
          maxlength={20000}
          aria-label="Message"
          value={chat.text()}
          onInput={(e) => { mobile.stopAudio(); chat.setText(e.currentTarget.value); }}
          onKeyDown={(e) => {
            // Enter sends; shift+enter is a new line.
            if (e.key === "Enter" && !e.shiftKey && !e.isComposing) send(e);
          }}
        />
        <button
          type="submit"
          class="button send-button"
          disabled={chat.sending() || !chat.text().trim()}
          aria-label={chat.sending() ? `Sending to ${name()}…` : `Send to ${name()}`}
          aria-busy={chat.sending()}
          title={chat.sending() ? "Sending…" : `Send to ${name()}`}
        >
          <span class="send-mark" aria-hidden="true">
            <Show when={target() === "busterclaw"} fallback={<Axe />}>
              <Hook />
            </Show>
          </span>
        </button>
      </form>
      <visuals.Viewer />
    </div>
  );
}
