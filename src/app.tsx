// tiny-axe's home: for a signed-in viewer, the chat history (searchable) and
// the Chat tab on the home page, and one chat at /chats/<id>. Built with
// Solid and TanStack Query, so when tiny-axe pushes chats (the page asks
// /api/changes which, every few seconds) each part of the page updates on
// its own, and whatever you're reading, typing or searching stays as it is.

import { QueryClientProvider } from "@tanstack/solid-query";
import { createEffect, createSignal, Match, on, Switch } from "solid-js";
import { render } from "solid-js/web";
import { session, signOut } from "./auth.ts";
import { ChatPage } from "./chats.tsx";
import { SignIn } from "./signin.tsx";
import "./style.css";
import { changesQuery, forget, go, queryClient, recall, remember, route, ROUTES } from "./store.ts";
import { HomePage } from "./views.tsx";

// Dark by default; the switch's choice is remembered in this browser. Set
// before anything draws, so a light page never starts dark.
const [theme, setTheme] = createSignal<"dark" | "light">(recall<string>("theme", "dark") === "light" ? "light" : "dark");
const applyTheme = (t: "dark" | "light") => {
  if (t === "light") document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;
};
applyTheme(theme());

function App() {
  createEffect(() => {
    applyTheme(theme());
    remember("theme", theme());
  });

  return (
    <>
      <TopBar />
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
          tiny-axe <span>chats</span>
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
    </header>
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
