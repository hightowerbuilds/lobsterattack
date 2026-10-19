// An agent's page: its mark, then what there is of it. tiny-axe's is its
// Chat (first) and its chat history (searchable), one at a time; BusterClaw's
// is its Chat, once it's connected. On phones the tabs are in the menu.

import { For, Match, Switch } from "solid-js";
import { Axe } from "./axe.tsx";
import { ChatsPage } from "./chats.tsx";
import { Hook } from "./hook.tsx";
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

/** tiny-axe's page, filling the window without scrolling it (a long view
 * scrolls within itself), its axe filling the window behind it. */
function TinyAxePage() {
  document.title = "TinyAxe · lobster attack";

  return (
    <div class="home stage">
      <div class="backdrop" aria-hidden="true">
        <Axe />
      </div>
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

/** BusterClaw's page: its hook fills the window, behind a see-through Chat.
 * Messages are delivered only to the BusterClaw computer. */
function BusterClawPage() {
  document.title = "BusterClaw · lobster attack";
  return (
    <div class="home stage">
      <div class="backdrop" aria-hidden="true">
        <Hook />
      </div>
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
