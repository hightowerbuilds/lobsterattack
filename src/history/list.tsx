import { createEffect, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { chatsQuery, type ChatList } from "./queries.ts";
import { chatHref } from "../navigation.ts";
import { clock, day, when, sameDay, plural } from "./time.ts";

// Kept while the page is open, so coming back from a chat finds the same search.
const [query, setQuery] = createSignal("");

export function ChatsPage() {
  let typing: number | undefined;
  onCleanup(() => clearTimeout(typing));
  const list = chatsQuery(query);
  const [shown, setShown] = createStore<ChatList>({ total: 0, sessions: [] });
  const [loaded, setLoaded] = createSignal(false);
  createEffect(() => {
    const latest = list.error ? null : list.data;
    if (!latest) return;
    setShown(reconcile(latest, { key: "id" }));
    setLoaded(true);
  });

  return (
    <div class="chats">
      <p class="lede">
        Every session with tiny-axe, by the launch it started in, newest first. Keys, tokens and card numbers are taken
        out before a session is kept.
      </p>
      <input
        id="chat-search"
        type="search"
        placeholder="Search chats"
        autocomplete="off"
        aria-label="Search chats"
        value={query()}
        onInput={(e) => {
          const q = e.currentTarget.value.trim();
          clearTimeout(typing);
          typing = window.setTimeout(() => setQuery(q), 120);
        }}
      />
      <Switch>
        <Match when={list.error}>{(error) => <p class="problem">{(error() as Error).message}</p>}</Match>
        <Match when={loaded() && shown.total === 0}>
          <p class="empty">No sessions yet. tiny-axe keeps one here once you've sent it a message.</p>
        </Match>
        <Match when={loaded() && shown.sessions.length === 0}>
          <p class="empty">No session has all of those words.</p>
        </Match>
      </Switch>
      <For each={shown.sessions}>
        {(session) => (
          <section class="session">
            <h2>
              <time datetime={session.started}>{when(session.started)}</time>
              <span class="count">{plural(session.chats.length, "chat")}</span>
            </h2>
            <ul>
              <For each={session.chats}>
                {(chat) => (
                  <li>
                    <a class="chat-row" href={chatHref(chat.id)} title={chat.title}>
                      <span class="label">{chat.title || "Untitled chat"}</span>
                      <time datetime={chat.started}>{sameDay(chat.started, session.started) ? clock(chat.started) : when(chat.started)}</time>
                      <span class="meta">
                        {chat.folder} · {plural(chat.messages, "message")}
                        {sameDay(chat.updated, chat.started) ? "" : ` · last on ${day(chat.updated)}`}
                      </span>
                      <Show when={chat.snippet !== chat.title && chat.snippet}>
                        <span class="snippet">{chat.snippet}</span>
                      </Show>
                    </a>
                  </li>
                )}
              </For>
            </ul>
          </section>
        )}
      </For>
    </div>
  );
}
