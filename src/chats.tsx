// The chat history: every session by the launch of tiny-axe it started in,
// searchable (the home page's Sessions tab), and one chat as it was shown. Both fetch again when tiny-axe
// writes a chat (the server's `history` event), into stores, so rows and
// messages already on the page stay put, and so do the scroll and the
// search. Text from chats always goes in as text; the only HTML inserted is
// a message the server rendered (render.ts).

import { createEffect, createMemo, createSignal, For, Match, on, Show, Switch } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { chatHref, chatQuery, chatsQuery, sessionsQuery, type ChatDetail, type ChatList } from "./store.ts";

// Kept while the page is open, so coming back from a chat finds the same search.
const [query, setQuery] = createSignal("");

export function ChatsPage() {
  let typing: number | undefined;
  const list = chatsQuery(query);
  // Each session's review (its category and concepts), from the session graph.
  const sessions = sessionsQuery();
  const reviewed = createMemo(() => {
    const m = new Map<string, { category: string; concepts: string[] }>();
    for (const n of sessions.data?.nodes ?? []) {
      if (n.kind === "session") m.set(n.id.slice("session:".length), { category: n.folder, concepts: n.drivers });
    }
    return m;
  });
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
                      <Show when={reviewed().get(chat.id)}>
                        {(r) => (
                          <span class="review-badges">
                            <span class="badge category">{r().category}</span>
                            <For each={r().concepts}>{(c) => <span class="badge concept">{c}</span>}</For>
                          </span>
                        )}
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

/** One chat: the user's messages and tiny-axe's replies, with the activity
 * between them, fetched again whenever tiny-axe writes it. */
export function ChatPage(props: { id: string }) {
  const chat = chatQuery(() => props.id);
  // Messages are matched by place, so a new one is added below the rest.
  const [shown, setShown] = createStore<{ chat: ChatDetail | null }>({ chat: null });
  createEffect(() => {
    const latest = chat.error ? null : chat.data;
    if (!latest) return;
    setShown("chat", reconcile(latest, { key: "id" }));
    document.title = `${latest.title || "Untitled chat"} · tiny-axe know-how`;
  });

  return (
    <div class="chat-page">
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
              <ol class="transcript">
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

// Times are kept in UTC and shown in the browser's own time and language.

const local = (iso: string, options: Intl.DateTimeFormatOptions) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, options);
};
const day = (iso: string) => local(iso, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
const clock = (iso: string) => local(iso, { hour: "numeric", minute: "2-digit" });
const when = (iso: string) =>
  local(iso, { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();
const plural = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;
