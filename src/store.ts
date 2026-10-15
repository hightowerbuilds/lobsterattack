// What the page shows, kept up to date: the chat list and the chats, where
// the page is, and the conveniences remembered in this browser.
//
// Every call to the server goes through TanStack Query (`queries` below): it
// keeps what each part of the page asked for, so coming back to a chat or a
// search shows it at once, and when the poll (`changesQuery`) hears that
// tiny-axe wrote a chat, the queries it touches are marked stale and fetched
// again. Solid signals and stores carry the results to the page, so each
// part updates on its own.

import { QueryClient, keepPreviousData, useQuery } from "@tanstack/solid-query";
import { createSignal } from "solid-js";
import { accessToken, signOut } from "./auth.ts";

export interface ChatRow {
  id: string;
  title: string;
  started: string;
  updated: string;
  folder: string;
  messages: number;
  /** Only when searching: where the words are. */
  snippet?: string;
}

export interface ChatList {
  /** Every chat in the history, matching or not. */
  total: number;
  sessions: { id: string; started: string; chats: ChatRow[] }[];
}

export interface ChatDetail {
  id: string;
  session: string;
  title: string;
  started: string;
  updated: string;
  folder: string;
  /** The user's and tiny-axe's messages come with the server's HTML. */
  entries: { kind: "user" | "assistant" | "meta"; text: string; html?: string }[];
}

/** Fetches from the site's API as the signed-in viewer. A session the API
 * no longer accepts signs out, which brings back the sign-in page. */
export async function get<T>(path: string): Promise<T> {
  const token = await accessToken();
  if (!token) {
    await signOut();
    throw new Error("Sign in to see this.");
  }
  const res = await fetch(path, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    await signOut();
    throw new Error("Sign in to see this.");
  }
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `The server said ${res.status}.`);
  return res.json() as Promise<T>;
}

// Remembered in this browser, as a convenience; the page works without.

export function recall<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    return saved === null ? fallback : (JSON.parse(saved) as T);
  } catch {
    return fallback;
  }
}

export function remember(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // See recall.
  }
}

// The queries

/** What the page asked the server for. Nothing goes stale on its own: the
 * poll says when something changed. A failed call isn't retried (a 401 has
 * already signed out). Every query names the client itself. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: Infinity, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false },
  },
});

export const chatsQuery = (q: () => string) =>
  useQuery(() => ({
    queryKey: ["chats", q()],
    queryFn: () => get<ChatList>(q() ? `/api/chats?q=${encodeURIComponent(q())}` : "/api/chats"),
    placeholderData: keepPreviousData,
  }), () => queryClient);

export const chatQuery = (id: () => string) =>
  useQuery(() => ({
    queryKey: ["chat", id()],
    queryFn: () => get<ChatDetail>(`/api/chat?id=${encodeURIComponent(id())}`),
    placeholderData: keepPreviousData,
  }), () => queryClient);

// tiny-axe pushes chats as they go on. The page asks every POLL_MS what
// changed since it last asked (not while the tab is hidden), and the API says
// which chats; those queries are then stale, and whatever's showing them
// fetches again.
export const POLL_MS = 15_000;

interface ChangesReply {
  chats: string | null;
  changed?: { chats: string[] } | { all: true };
}

let since: string | null = null;

export const changesQuery = () =>
  useQuery(() => ({
    queryKey: ["changes"],
    queryFn: async () => {
      const reply = await get<ChangesReply>(since ? `/api/changes?since=${encodeURIComponent(since)}` : "/api/changes");
      const changed = reply.changed;
      if (changed && "all" in changed) chatsChanged([]);
      else if (changed && changed.chats.length > 0) chatsChanged(changed.chats);
      const latest = [reply.chats, since].filter((t) => t !== null).sort((a, b) => Date.parse(a) - Date.parse(b));
      since = latest.at(-1) ?? null;
      return reply;
    },
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 0,
  }), () => queryClient);

/** Signed out: forget everything fetched, and where the poll was. */
export function forget() {
  since = null;
  queryClient.clear();
}

/** The server says these chats changed (none given: all of them). */
export function chatsChanged(ids: string[]) {
  queryClient.invalidateQueries({ queryKey: ["chats"] });
  queryClient.invalidateQueries({
    queryKey: ["chat"],
    predicate: (q) => ids.length === 0 || ids.includes(q.queryKey[1] as string),
  });
}

// Where the page is: an agent's Chat (/tiny-axe, /busterclaw; / is the agent
// you were on last), tiny-axe's chat history (/chats, where tiny-axe links),
// or one of its chats (/chats/<id>).

export const AGENTS = ["tiny-axe", "busterclaw"] as const;
export type Agent = (typeof AGENTS)[number];
export type View = "chat" | "history";

export type Route = { kind: "home"; agent: Agent; view: View } | { kind: "chat"; id: string };

const here = () => location.pathname + location.search;
// Not deduplicated: following a link to where the page is still counts.
export const [href, setHref] = createSignal(here(), { equals: false });

const lastAgent = (): Agent => {
  const saved = recall<string>("agent", "tiny-axe");
  return AGENTS.find((a) => a === saved) ?? "tiny-axe";
};

export function route(): Route {
  const url = new URL(href(), location.origin);
  const chat = url.pathname.match(/^\/chats\/(.+)$/);
  if (chat) return { kind: "chat", id: decodeURIComponent(chat[1]) };
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
