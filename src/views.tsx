// An agent's page: tiny-axe has Chat and searchable history, one at a time;
// BusterClaw has Chat. On phones the tabs are in the menu.

import { For, Match, Switch } from "solid-js";
import { ChatsPage } from "./chats.tsx";
import { RemoteChat } from "./remote.tsx";
import { agent, route } from "./store.ts";

export const AGENT_NAMES = { "tiny-axe": "TinyAxe", busterclaw: "BusterClaw" } as const;

/** The page of the agent picked in the top bar. */
export function HomePage() {
  return (
    <Switch>
      <Match when={agent() === "tiny-axe"}>
        <TinyAxePage />
      </Match>
      <Match when={agent() === "busterclaw"}>
        <BusterClawPage />
      </Match>
    </Switch>
  );
}

/** An agent's views, as links: tiny-axe's Chat is /tiny-axe, its history /chats. */
export const VIEWS = {
  "tiny-axe": [
    { view: "chat", label: "Chat", href: "/tiny-axe" },
    { view: "history", label: "History", href: "/chats" },
  ],
  busterclaw: [{ view: "chat", label: "Chat", href: "/busterclaw" }],
} as const;

const view = () => {
  const r = route();
  return r.kind === "home" ? r.view : "history";
};

function Tabs() {
  return (
    <nav class="tabs" aria-label={AGENT_NAMES[agent()]}>
      <For each={VIEWS[agent()]}>
        {(v) => (
          <a href={v.href} aria-current={view() === v.view ? "page" : undefined}>
            {v.label}
          </a>
        )}
      </For>
    </nav>
  );
}

/** tiny-axe's page fills the window; each view scrolls within itself. */
function TinyAxePage() {
  document.title = "TinyAxe · lobster attack";

  return (
    <div class="home">
      <Tabs />
      <div class="home-pane">
        <Switch>
          <Match when={view() === "history"}>
            <ChatsPage />
          </Match>
          <Match when={view() === "chat"}>
            <div class="chat-tab">
              <p class="lede">
                Talk to your tiny-axe, wherever it's running. It answers in a 🌐 chat on that machine; anything that needs
                a yes shows up here as a card, to approve with your PIN (set it with /remote pin in tiny-axe).
              </p>
              <RemoteChat agent="tiny-axe" />
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  );
}

/** Messages on this page are delivered only to the BusterClaw computer. */
function BusterClawPage() {
  document.title = "BusterClaw · lobster attack";
  return (
    <div class="home">
      <Tabs />
      <div class="home-pane">
        <div class="chat-tab">
          <p class="lede">Talk to BusterClaw, wherever it's running.</p>
          <RemoteChat agent="busterclaw" />
        </div>
      </div>
    </div>
  );
}
