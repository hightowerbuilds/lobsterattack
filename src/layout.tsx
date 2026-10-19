import { createEffect, For, Show } from "solid-js";
import { signOut } from "./auth.ts";
import { newChat } from "./remote/conversation.ts";
import { agent, AGENTS, go, menuOpen, route, setMenuOpen } from "./navigation.ts";
import { AGENT_NAMES, VIEWS } from "./views.tsx";

export function TopBar() {
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
export function Menu() {
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
      ref={el => { dialog = el; }}
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
