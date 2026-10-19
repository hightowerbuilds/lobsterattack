import { createSignal } from "solid-js";
import { AGENTS, type Agent } from "../supabase/functions/_shared/agents.ts";
import { recall } from "./preferences.ts";

// Where the page is: an agent's Chat (/tiny-axe, /busterclaw; / is the agent
// you were on last), tiny-axe's chat history (/chats, where tiny-axe links),
// or one of its chats (/chats/<id>).

export { AGENTS };
export type { Agent };
export type View = "chat" | "history";

export type Route = { kind: "home"; agent: Agent; view: View } | { kind: "chat"; id: string };

const here = () => location.pathname + location.search;
// Not deduplicated: following a link to where the page is still counts.
const [href, setHref] = createSignal(here(), { equals: false });

const lastAgent = (): Agent => {
  const saved = recall<string>("agent", "tiny-axe");
  return AGENTS.find((a) => a === saved) ?? "tiny-axe";
};

export function route(): Route {
  const url = new URL(href(), location.origin);
  const chat = url.pathname.match(/^\/chats\/(.+)$/);
  if (chat) {
    try { return { kind: "chat", id: decodeURIComponent(chat[1]) }; }
    catch { return { kind: "chat", id: chat[1] }; }
  }
  if (url.pathname === "/chats") return { kind: "home", agent: "tiny-axe", view: "history" };
  const agent = AGENTS.find((a) => url.pathname === `/${a}`);
  return { kind: "home", agent: agent ?? lastAgent(), view: "chat" };
}

/** The agent the page is about: a chat is tiny-axe's. */
export const agent = (): Agent => {
  const r = route();
  return r.kind === "home" ? r.agent : "tiny-axe";
};

export const ROUTES = (path: string) =>
  path === "/" || path === "/chats" || path.startsWith("/chats/") || AGENTS.some((a) => path === `/${a}`);

/** Whether the phone menu is open. */
export const [menuOpen, setMenuOpen] = createSignal(false);

export function go(to: string) {
  if (to !== here()) history.pushState(null, "", to);
  setMenuOpen(false);
  setHref(here());
  window.scrollTo(0, 0);
  document.getElementById("main")?.focus({ preventScroll: true });
}

window.addEventListener("popstate", () => setHref(here()));

export const chatHref = (id: string) => `/chats/${encodeURIComponent(id)}`;
