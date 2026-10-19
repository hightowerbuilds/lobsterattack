import { createEffect, For, on, Match, Show, Switch } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { chatQuery, type ChatDetail } from "./queries.ts";
import { createVisualViewer } from "../visual-viewer.tsx";
import { day, when, sameDay } from "./time.ts";

/** One chat: the user's messages and tiny-axe's replies, with the activity
 * between them, fetched again whenever tiny-axe writes it. */
export function ChatPage(props: { id: string }) {
  const visuals = createVisualViewer();
  createEffect(on(() => props.id, visuals.close, { defer: true }));
  const chat = chatQuery(() => props.id);
  // Messages are matched by place, so a new one is added below the rest.
  const [shown, setShown] = createStore<{ chat: ChatDetail | null }>({ chat: null });
  createEffect(() => {
    const latest = chat.error ? null : chat.data;
    if (!latest) return;
    setShown("chat", reconcile(latest, { key: "id" }));
    document.title = `${latest.title || "Untitled chat"} · lobster attack`;
  });

  return (
    <div class="chat-page">
      <visuals.Viewer />
      <div class="crumbs">
        <a href="/chats">← All chats</a>
      </div>
      <Switch>
        <Match when={chat.error}>{(error) => <p class="problem">{(error() as Error).message}</p>}</Match>
        <Match when={shown.chat}>
          {(c) => (
            <>
              <h1>{c().title || "Untitled chat"}</h1>
              <p class="chat-meta">
                {c().folder} · <time datetime={c().started}>{when(c().started)}</time>
                {sameDay(c().updated, c().started) ? "" : ` · last on ${day(c().updated)}`}
              </p>
              <ol class="transcript" onClick={visuals.openFromClick}>
                <For each={c().entries}>
                  {(e) => (
                    <Show when={e.kind !== "meta"} fallback={<li class="activity">{e.text}</li>}>
                      <li class={`message ${e.kind}`}>
                        <div class="who">{e.kind === "user" ? "You" : "tiny-axe"}</div>
                        <div class="body" innerHTML={e.html ?? ""} />
                      </li>
                    </Show>
                  )}
                </For>
              </ol>
            </>
          )}
        </Match>
      </Switch>
    </div>
  );
}
