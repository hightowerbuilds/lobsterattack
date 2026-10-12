// tiny-axe's home: a sidebar of notes beside the graph, the overview, a
// note with its local graph, or the chat history, for a signed-in viewer
// (tiny-axe's local viewer, moved here). Built with Solid, so when tiny-axe
// pushes notes or chats (the page asks /api/changes which, every few seconds)
// each part of the page updates on its own: new notes join the lists and the
// graph, counts change in place, and whatever you're reading, typing or
// filtering stays as it is.

import { createEffect, createResource, createSignal, For, Match, on, onCleanup, Show, Switch } from "solid-js";
import { render } from "solid-js/web";
import { session, signOut } from "./auth.ts";
import { ChatPage, ChatsPage } from "./chats.tsx";
import { SignIn } from "./signin.tsx";
import "./style.css";
import { GraphPage } from "./graph-page.tsx";
import {
  changes,
  chatsChanged,
  get,
  go,
  graph,
  loaded,
  menuOpen,
  overview,
  problem,
  recall,
  refresh,
  remember,
  route,
  ROUTES,
  setLoaded,
  setMenuOpen,
  setOverview,
  setGraph,
  sorted,
  type Result,
} from "./store.ts";
import { Item, NotePage, OverviewPage } from "./views.tsx";

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

  return (
    <>
      <Sidebar />
      <Bumper />
      <main id="main" tabindex="-1" classList={{ full: route().kind === "graph" }}>
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
    <Switch fallback={<GraphPage />}>
      <Match when={route().kind === "overview"}>
        <OverviewPage />
      </Match>
      <Match when={note()}>{(id) => <NotePage id={id()} />}</Match>
      <Match when={route().kind === "chats"}>
        <ChatsPage />
      </Match>
      <Match when={chat()}>{(id) => <ChatPage id={id()} />}</Match>
    </Switch>
  );
}

function Sidebar() {
  const [query, setQuery] = createSignal("");
  let typing: number | undefined;
  const summary = () => {
    const s = overview.summary;
    return s ? `${s.sites} sites · ${s.pages} pages · ${s.paths} paths (${s.blocked} stopped) · ${s.tools} tools · ${s.tasks} tasks` : "";
  };

  return (
    <aside id="sidebar" classList={{ open: menuOpen() }}>
      <header class="brand">
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
          <button id="menu" type="button" aria-expanded={menuOpen()} aria-controls="tree" onClick={() => setMenuOpen(!menuOpen())}>
            Notes
          </button>
        </span>
      </header>
      <nav class="views" aria-label="Views">
        <a href="/" aria-current={route().kind === "graph" ? "page" : undefined}>
          Graph
        </a>
        <a href="/overview" aria-current={route().kind === "overview" ? "page" : undefined}>
          Overview
        </a>
        <a href="/chats" aria-current={["chats", "chat"].includes(route().kind) ? "page" : undefined}>
          Chats
        </a>
      </nav>
      <p id="summary" class="summary">
        {summary()}
      </p>
      <input
        id="search"
        type="search"
        placeholder="Search notes"
        autocomplete="off"
        aria-label="Search notes"
        onInput={(e) => {
          const q = e.currentTarget.value.trim();
          clearTimeout(typing);
          typing = window.setTimeout(() => setQuery(q), 120);
        }}
      />
      <nav id="tree" aria-label="Notes">
        <Show when={query()} fallback={<Tree />}>
          {(q) => <Results query={q()} />}
        </Show>
      </nav>
    </aside>
  );
}

function Tree() {
  const open = new Set(recall<string[]>("open-folders", ["Sites"]));
  const toggled = (name: string, isOpen: boolean) => {
    if (isOpen) open.add(name);
    else open.delete(name);
    remember("open-folders", [...open]);
  };
  return (
    <For each={overview.folders}>
      {(folder) => (
        <details open={open.has(folder.name)} on:toggle={(e) => toggled(folder.name, e.currentTarget.open)}>
          <summary>
            {folder.name}
            <span class="count">{folder.notes.length}</span>
          </summary>
          <ul>
            <For each={sorted(folder.name, folder.notes)}>
              {(e) => (
                <li>
                  <Item entry={e} />
                </li>
              )}
            </For>
          </ul>
        </details>
      )}
    </For>
  );
}

// Search results, searched again as the vault changes.
function Results(props: { query: string }) {
  const [results] = createResource(
    () => [props.query, changes().version] as const,
    async ([q]) => (await get<{ results: Result[] }>(`/api/search?q=${encodeURIComponent(q)}`)).results,
  );
  return (
    <Switch>
      <Match when={results.error}>{(error) => <p class="problem">{(error() as Error).message}</p>}</Match>
      <Match when={results.latest?.length === 0}>
        <p class="empty">Nothing matches.</p>
      </Match>
      <Match when={results.latest}>
        {(list) => (
          <ul class="results">
            <For each={list()}>
              {(r) => (
                <li>
                  <Item entry={r}>
                    <span class="where">{r.folder}</span>
                    <Show when={r.snippet}>
                      <span class="snippet">{r.snippet}</span>
                    </Show>
                  </Item>
                </li>
              )}
            </For>
          </ul>
        )}
      </Match>
    </Switch>
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

// tiny-axe pushes notes as tasks finish, and chats as they go on. The page
// asks every POLL_MS what changed since it last asked (not while the tab is
// hidden), and the API says which notes and chats.
const POLL_MS = 15_000;

interface ChangesReply {
  notes: string | null;
  chats: string | null;
  changed?: { notes: string[]; chats: string[] } | { all: true };
}

function poll(): () => void {
  let since: string | null = null;
  let timer: number | undefined;
  let stopped = false;

  async function tick() {
    if (!document.hidden) {
      try {
        const reply = await get<ChangesReply>(since ? `/api/changes?since=${encodeURIComponent(since)}` : "/api/changes");
        const changed = reply.changed;
        if (changed && "all" in changed) {
          refresh(graph()?.nodes.map((n) => n.id) ?? []);
          chatsChanged([]);
        } else if (changed) {
          if (changed.notes.length > 0) refresh(changed.notes);
          if (changed.chats.length > 0) chatsChanged(changed.chats);
        }
        const latest = [reply.notes, reply.chats, since].filter((t) => t !== null).sort((a, b) => Date.parse(a) - Date.parse(b));
        since = latest.at(-1) ?? null;
      } catch {
        // Shown by the next fetch that fails; asked again next time.
      }
    }
    if (!stopped) timer = window.setTimeout(tick, POLL_MS);
  }

  const visible = () => {
    if (document.hidden || stopped) return;
    clearTimeout(timer);
    tick();
  };
  document.addEventListener("visibilitychange", visible);
  tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", visible);
  };
}

// Signed in: fetch, then keep up. Signed out: forget what was shown.
function Root() {
  createEffect(
    on(
      () => session()?.user.id,
      (user) => {
        if (!user) {
          setLoaded(false);
          setOverview({ summary: null, folders: [] });
          setGraph(null);
          return;
        }
        refresh().then(() => setLoaded(true));
        onCleanup(poll());
      },
    ),
  );

  return (
    <Switch>
      <Match when={session() === null}>
        <SignIn />
      </Match>
      <Match when={session() && loaded()}>
        <App />
      </Match>
    </Switch>
  );
}

render(() => <Root />, document.body);
