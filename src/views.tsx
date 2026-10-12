// The home page: the chat history (searchable) and the Chat tab, one tab at
// a time.

import { createSignal, For, Match, Switch } from "solid-js";
import { Axe } from "./axe.tsx";
import { ChatsPage } from "./chats.tsx";
import { RemoteChat } from "./remote.tsx";
import { recall, remember } from "./store.ts";

const TABS = ["History", "Chat"] as const;
type Tab = (typeof TABS)[number];

/** The home page, filling the window without scrolling it (a long tab
 * scrolls within itself). The tab is remembered in this browser; /chats
 * always opens on the history. */
export function HomePage() {
  document.title = "tiny-axe chats";
  const saved = location.pathname === "/chats" ? "History" : recall<string>("home-tab", "History");
  const [tab, setTab] = createSignal<Tab>(saved === "Chat" ? "Chat" : "History");
  const pick = (t: Tab) => {
    setTab(t);
    remember("home-tab", t);
  };

  return (
    <div class="home">
      <header class="home-head">
        <Axe />
      </header>
      <div class="tabs" role="tablist" aria-label="Home">
        <For each={TABS}>
          {(t) => (
            <button type="button" role="tab" aria-selected={tab() === t} onClick={() => pick(t)}>
              {t}
            </button>
          )}
        </For>
      </div>
      <div class="home-pane" role="tabpanel">
        <Switch>
          <Match when={tab() === "History"}>
            <ChatsPage />
          </Match>
          <Match when={tab() === "Chat"}>
            <div class="chat-tab">
              <p class="lede">
                Talk to your tiny-axe, wherever it's running. It answers in a 🌐 chat on that machine; anything that needs
                a yes there is refused for now.
              </p>
              <RemoteChat />
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  );
}
