// tiny-axe's home: a sidebar of notes beside the graph, the overview, a
// note with its local graph, or the chat history, for a signed-in viewer
// (tiny-axe's local viewer, moved here). Built with Solid and TanStack
// Query, so when tiny-axe pushes notes or chats (the page asks /api/changes
// which, every few seconds) each part of the page updates on its own: new
// notes join the lists and the graph, counts change in place, and whatever
// you're reading, typing or filtering stays as it is.

import { QueryClientProvider } from "@tanstack/solid-query";
import { createEffect, createSignal, Match, on, Show, Switch } from "solid-js";
import { render } from "solid-js/web";
import { session, signOut } from "./auth.ts";
import { ChatPage, ChatsPage } from "./chats.tsx";
import { SignIn } from "./signin.tsx";
import "./style.css";
import { FilterPanel, fitGraph, GraphPage, warmGraph } from "./graph-page.tsx";
import {
  changesQuery,
  forget,
  go,
  graph,
  loaded,
  overview,
  problem,
  queryClient,
  recall,
  remember,
  route,
  ROUTES,
  showVault,
  vaultQuery,
} from "./store.ts";
import { HomePage, NotePage } from "./views.tsx";

// Dark by default; the switch's choice is remembered in this browser. Set
// before anything draws, so a light page never starts dark.
const [theme, setTheme] = createSignal<"dark" | "light">(recall<string>("theme", "dark") === "light" ? "light" : "dark");
const applyTheme = (t: "dark" | "light") => {
  if (t === "light") document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;
};
applyTheme(theme());

// The sidebar folds away behind the bumper beside it, and stays as you left
// it in this browser; set before anything draws too.
const [sideOpen, setSideOpen] = createSignal(recall<boolean>("sidebar-open", true) !== false);
const applySide = (open: boolean) => {
  if (open) delete document.documentElement.dataset.sidebar;
  else document.documentElement.dataset.sidebar = "closed";
};
applySide(sideOpen());

function App() {
  createEffect(() => {
    applyTheme(theme());
    remember("theme", theme());
  });
  createEffect(() => {
    applySide(sideOpen());
    remember("sidebar-open", sideOpen());
  });

  // The graph page has the sidebar (and its bumper); the others a top bar.
  createEffect(() => {
    if (route().kind === "graph") document.documentElement.dataset.page = "graph";
    else delete document.documentElement.dataset.page;
  });

  return (
    <>
      <Show when={route().kind === "graph"} fallback={<TopBar />}>
        <Sidebar />
        <Bumper />
      </Show>
      <main id="main" tabindex="-1" classList={{ full: route().kind === "graph", fixed: route().kind === "home" }}>
        <Show when={problem()} fallback={<Page />}>
          {(message) => <p class="problem">{message()}</p>}
        </Show>
      </main>
    </>
  );
}

// A strip running the sidebar's full height: any of it opens or closes the
// sidebar, and its arrow says which way. Phones fold the sidebar their own
// way (the Notes button), so it's hidden there.
function Bumper() {
  return (
    <button
      id="bumper"
      type="button"
      aria-controls="sidebar"
      aria-expanded={sideOpen()}
      aria-label={sideOpen() ? "Hide the sidebar" : "Show the sidebar"}
      title={sideOpen() ? "Hide the sidebar" : "Show the sidebar"}
      onClick={() => setSideOpen(!sideOpen())}
    >
      <span class="arrow" aria-hidden="true">
        {sideOpen() ? "‹" : "›"}
      </span>
    </button>
  );
}

function Page() {
  const note = () => {
    const r = route();
    return r.kind === "note" ? r.id : null;
  };
  const chat = () => {
    const r = route();
    return r.kind === "chat" ? r.id : null;
  };
  return (
    <Switch fallback={<HomePage />}>
      <Match when={route().kind === "graph"}>
        <GraphPage />
      </Match>
      <Match when={note()}>{(id) => <NotePage id={id()} />}</Match>
      <Match when={route().kind === "chats"}>
        <ChatsPage />
      </Match>
      <Match when={chat()}>{(id) => <ChatPage id={id()} />}</Match>
    </Switch>
  );
}

// The graph page's sidebar: the site's header and views, Fit, and the
// filters. The other pages have the top bar instead.
function Sidebar() {
  return (
    <aside id="sidebar">
      <Brand />
      <Views />
      <button type="button" class="fit" title="Bring every note into view" onClick={() => fitGraph()}>
        Fit
      </button>
      <Show when={graph()}>
        <FilterPanel always />
      </Show>
    </aside>
  );
}

function TopBar() {
  return (
    <header class="topbar">
      <Brand />
      <Views />
    </header>
  );
}

function Brand() {
  return (
    <div class="brand">
      <a href="/">
        tiny-axe <span>know-how</span>
      </a>
      <span class="brand-tools">
        <button
          id="theme"
          type="button"
          aria-pressed={theme() === "dark"}
          title="Switch between dark and light"
          onClick={() => setTheme(theme() === "dark" ? "light" : "dark")}
        >
          Dark
        </button>
        <button id="signout" type="button" title="Sign out of this browser" onClick={() => signOut()}>
          Sign out
        </button>
      </span>
    </div>
  );
}

function Views() {
  return (
    <nav class="views" aria-label="Views">
      <a href="/" aria-current={route().kind === "home" ? "page" : undefined}>
        Home
      </a>
      <a href="/graph" aria-current={route().kind === "graph" ? "page" : undefined}>
        Graph
      </a>
      <a href="/chats" aria-current={["chats", "chat"].includes(route().kind) ? "page" : undefined}>
        Sessions
      </a>
    </nav>
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

// Signed in: the vault, kept up by the poll. Signed out: forget what was shown.
function SignedIn() {
  const vault = vaultQuery();
  changesQuery();
  createEffect(() => showVault(vault.data, vault.error));
  // The graph lays itself out from here on, whichever page is open.
  createEffect(() => loaded() && warmGraph());
  return (
    <Show when={loaded()}>
      <App />
    </Show>
  );
}

function Root() {
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
