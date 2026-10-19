// Lobster Attack: a home for your agents, for a signed-in viewer. A page per
// agent, picked in the top bar: tiny-axe's chat history (searchable) and its
// Chat tab, with one chat at /chats/<id>; BusterClaw's Chat. Built with Solid
// and TanStack Query, so when tiny-axe pushes chats (the page asks
// /api/changes which, every few seconds) each part of the page updates on
// its own, and whatever you're reading, typing or searching stays as it is.

import { QueryClientProvider } from "@tanstack/solid-query";
import { createEffect, Match, onCleanup, Switch } from "solid-js";
import { render } from "solid-js/web";
import { session } from "./auth.ts";
import { ChatPage } from "./history/detail.tsx";
import { SignIn } from "./signin.tsx";
import "./style.css";
import { agent, go, route, ROUTES } from "./navigation.ts";
import { changesQuery, forget, queryClient } from "./history/queries.ts";
import { remember } from "./preferences.ts";
import { HomePage } from "./views.tsx";
import { TopBar, Menu } from "./layout.tsx";

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

// Links within the page change the view without loading a new page.
document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const a = event.target.closest("a");
  if (!a || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || a.target || a.hasAttribute("download")) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || !ROUTES(url.pathname)) return;
  event.preventDefault();
  go(url.pathname + url.search);
});

// Signed in: the page, kept up by the poll.
function SignedIn() {
  onCleanup(forget);
  changesQuery();
  return <App />;
}

function Root() {
  return (
    <QueryClientProvider client={queryClient}>
      <Switch>
        <Match when={session() === null}>
          <SignIn />
        </Match>
        <Match when={session()?.user.id} keyed>
          <SignedIn />
        </Match>
      </Switch>
    </QueryClientProvider>
  );
}

render(() => <Root />, document.body);
