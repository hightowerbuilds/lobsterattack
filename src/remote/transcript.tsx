import { For, Show } from "solid-js";
import { renderChat } from "../../api/_lib/chats/render.ts";
import { ApprovalCard } from "./approval-card.tsx";
import type { RemoteSession } from "./session.ts";

export function Transcript(props: { chat: RemoteSession; name: () => string }) {
  const chat = props.chat;
  return (
    <ol class="transcript">
      <For each={chat.messages}>
        {(m) => (
          <>
            <li class={`message ${m.role}`} classList={{ failed: m.status === "failed" }}>
              <div class="who">{m.role === "user" ? "You" : props.name()}</div>
              <Show when={m.role === "assistant"} fallback={<div class="body plain">{m.body}</div>}>
                <div class="body" innerHTML={renderChat(m.body)} />
              </Show>
              <Show when={m.role === "user" && chat.waiting(m)}>{(why) => <div class="note">{why()}</div>}</Show>
            </li>
            <For each={m.role === "user" ? chat.cardsFor(m.id) : []}>{(a) => <ApprovalCard approval={a} onUpdate={chat.upsertApproval} />}</For>
            <Show when={m.role === "user" && m.status === "working" && chat.online() && !chat.replyTo(m.id)}>
              <li class="message assistant live" aria-live="polite">
                <div class="who">{props.name()}</div>
                <Show when={chat.live[m.id]?.status}>{(s) => <div class="activity">{s()}</div>}</Show>
                <Show when={chat.live[m.id]?.text} fallback={<div class="body thinking">…</div>}>
                  {(t) => <div class="body" innerHTML={renderChat(t())} />}
                </Show>
              </li>
            </Show>
          </>
        )}
      </For>
      <For each={chat.cardsFor(null)}>{(a) => <ApprovalCard approval={a} onUpdate={chat.upsertApproval} />}</For>
    </ol>
  );
}
