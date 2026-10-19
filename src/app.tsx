// Lobster Attack: a home for your agents, for a signed-in viewer. A page per
// agent, picked in the top bar: tiny-axe's chat history (searchable) and its
// Chat tab, with one chat at /chats/<id>; BusterClaw's Chat. Built with Solid
// and TanStack Query, so when tiny-axe pushes chats (the page asks
// /api/changes which, every few seconds) each part of the page updates on
// its own, and whatever you're reading, typing or searching stays as it is.

import { QueryClientProvider } from "@tanstack/solid-query";
import { createEffect, For, Match, on, Show, Switch } from "solid-js";
import { render } from "solid-js/web";
import { session, signOut } from "./auth.ts";
import { ChatPage } from "./chats.tsx";
import { SignIn } from "./signin.tsx";
import "./style.css";
import { newChat } from "./remote.tsx";
import {
  agent,
  AGENTS,
  changesQuery,
  forget,
  go,
  menuOpen,
  queryClient,
  remember,
  route,
  ROUTES,
  setMenuOpen,
} from "./store.ts";
import { AGENT_NAMES, HomePage, VIEWS } from "./views.tsx";

// The selected agent owns the palette, including on a direct page load.
const applyAgentTheme = () => {
  document.documentElement.dataset.agent = agent();
};
applyAgentTheme();

function App() {
  createEffect(() => {
    applyAgentTheme();
    // / opens the agent you were on last.
    remember("agent", agent());
  });

  return (
    <>
      <TopBar />
      <Menu />
      <main id="main" tabindex="-1" classList={{ fixed: route().kind === "home" }}>
        <Page />
      </main>
    </>
  );
}

function Page() {
  const chat = () => {
    const r = route();
    return r.kind === "chat" ? r.id : null;
  };
  return (
    <Switch fallback={<HomePage />}>
      <Match when={chat()}>{(id) => <ChatPage id={id()} />}</Match>
    </Switch>
  );
}

function TopBar() {
  return (
    <header class="topbar">
      <div class="brand">
        <a href="/">
          lobster <span>attack</span>
        </a>
        <nav class="agents" aria-label="Agents">
          <For each={AGENTS}>
            {(a) => (
              <a href={`/${a}`} aria-current={agent() === a ? "page" : undefined}>
                {AGENT_NAMES[a]}
              </a>
            )}
          </For>
        </nav>
        <span class="brand-tools">
          <button id="signout" type="button" title="Sign out of this browser" onClick={() => signOut()}>
            Sign out
          </button>
        </span>
        <button
          class="menu-button"
          type="button"
          aria-label="Open the menu"
          aria-controls="menu"
          aria-expanded={menuOpen()}
          onClick={() => setMenuOpen(true)}
        >
          ☰
        </button>
      </div>
    </header>
  );
}

// Phones: the top bar's links and buttons, and the agent's views, in a menu
// over the whole page. A link in it goes there and closes it; so do the ✕,
// Escape and a tap outside it.
function Menu() {
  let dialog!: HTMLDialogElement;
  createEffect(() => {
    if (menuOpen() && !dialog.open) dialog.showModal();
    else if (!menuOpen() && dialog.open) dialog.close();
  });
  const here = (href: string) => {
    const r = route();
    return VIEWS[agent()].some((v) => v.href === href && r.kind === "home" && r.view === v.view);
  };

  return (
    <dialog
      id="menu"
      ref={dialog}
      aria-label="Menu"
      onClose={() => setMenuOpen(false)}
      onClick={(e) => e.target === dialog && setMenuOpen(false)}
    >
      <div class="menu-head">
        <span class="menu-title">
          lobster <span>attack</span>
        </span>
        <button type="button" class="menu-close" aria-label="Close the menu" onClick={() => setMenuOpen(false)}>
          ✕
        </button>
      </div>
      <nav class="menu-agents" aria-label="Agents">
        <For each={AGENTS}>
          {(a) => (
            <a href={`/${a}`} aria-current={agent() === a ? "page" : undefined}>
              {AGENT_NAMES[a]}
            </a>
          )}
        </For>
      </nav>
      <nav class="menu-views" aria-label={AGENT_NAMES[agent()]}>
        <For each={VIEWS[agent()]}>
          {(v) => (
            <a href={v.href} aria-current={here(v.href) ? "page" : undefined}>
              {v.label}
            </a>
          )}
        </For>
        <Show when={route().kind === "home"}>
          <button
            type="button"
            onClick={() => {
              newChat();
              go(`/${agent()}`);
            }}
          >
            New chat
          </button>
        </Show>
      </nav>
      <div class="menu-tools">
        <button
          type="button"
          onClick={() => {
            setMenuOpen(false);
            signOut();
          }}
        >
          Sign out
        </button>
      </div>
    </dialog>
  );
}

// Links within the page change the view without loading a new page.
document.addEventListener("click", (event) => {
  const a = (event.target as Element).closest("a");
  if (!a || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || !ROUTES(url.pathname)) return;
  event.preventDefault();
  go(url.pathname + url.search);
});

// Signed in: the page, kept up by the poll.
function SignedIn() {
  changesQuery();
  return <App />;
}

function Root() {
  // Signed out: forget what was shown.
  createEffect(on(() => session()?.user.id, (user) => !user && forget()));

  return (
    <QueryClientProvider client={queryClient}>
      <Switch>
        <Match when={session() === null}>
          <SignIn />
        </Match>
        <Match when={session()}>
          <SignedIn />
        </Match>
      </Switch>
    </QueryClientProvider>
  );
}

render(() => <Root />, document.body);
