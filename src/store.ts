// What the page shows, kept up to date: the vault's overview and graph
// (fetched again whenever tiny-axe writes notes), which chats changed,
// where the page is, and the conveniences remembered in this browser.
//
// Every call to the server goes through TanStack Query (`queries` below): it
// keeps what each part of the page asked for, so coming back to a note or a
// search shows it at once, and when the poll (`pollChanges`) hears that
// tiny-axe wrote something, the queries it touches are marked stale and
// fetched again. Solid signals and a store carry the results to the page,
// so each part updates on its own.

import { QueryClient, keepPreviousData, useQuery } from "@tanstack/solid-query";
import { batch, createSignal } from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import type { GraphData } from "../api/_lib/vault/graph.ts";
import { accessToken, signOut } from "./auth.ts";

export type Value = string | number | boolean | null | string[];

export interface Entry {
  id: string;
  title: string;
  kind: string;
  trust: string;
  gate: string | null;
  seen: number | null;
  last_seen: string | null;
}

export interface Overview {
  summary: Record<"sites" | "pages" | "controls" | "paths" | "blocked" | "tools" | "tasks" | "notes", number>;
  folders: { name: string; notes: Entry[] }[];
}

export interface NoteDetail extends Entry {
  folder: string;
  props: [string, Value][];
  refs: Record<string, { id: string; title: string; kind: string }>;
  html: string;
  backlinks: { folder: string; notes: Entry[] }[];
}

export interface Result extends Entry {
  folder: string;
  snippet: string;
}

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
 * already signed out). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: Infinity, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false },
  },
});

/** The vault, in one go: its overview and its graph. */
export const vaultQuery = () =>
  useQuery(() => ({
    queryKey: ["vault"],
    queryFn: async () => {
      const [overview, graph] = await Promise.all([get<Overview>("/api/vault"), get<GraphData>("/api/graph")]);
      return { overview, graph };
    },
  }));

export const noteQuery = (id: () => string) =>
  useQuery(() => ({
    queryKey: ["note", id()],
    queryFn: () => get<NoteDetail>(`/api/note?id=${encodeURIComponent(id())}`),
    placeholderData: keepPreviousData,
  }));

export const searchQuery = (q: () => string) =>
  useQuery(() => ({
    queryKey: ["search", q()],
    queryFn: async () => (await get<{ results: Result[] }>(`/api/search?q=${encodeURIComponent(q())}`)).results,
    placeholderData: keepPreviousData,
  }));

export const chatsQuery = (q: () => string) =>
  useQuery(() => ({
    queryKey: ["chats", q()],
    queryFn: () => get<ChatList>(q() ? `/api/chats?q=${encodeURIComponent(q())}` : "/api/chats"),
    placeholderData: keepPreviousData,
  }));

export const chatQuery = (id: () => string) =>
  useQuery(() => ({
    queryKey: ["chat", id()],
    queryFn: () => get<ChatDetail>(`/api/chat?id=${encodeURIComponent(id())}`),
    placeholderData: keepPreviousData,
  }));

// tiny-axe pushes notes as tasks finish, and chats as they go on. The page
// asks every POLL_MS what changed since it last asked (not while the tab is
// hidden), and the API says which notes and chats; those queries are then
// stale, and whatever's showing them fetches again.
export const POLL_MS = 15_000;

interface ChangesReply {
  notes: string | null;
  chats: string | null;
  changed?: { notes: string[]; chats: string[] } | { all: true };
}

let since: string | null = null;

export const changesQuery = () =>
  useQuery(() => ({
    queryKey: ["changes"],
    queryFn: async () => {
      const reply = await get<ChangesReply>(since ? `/api/changes?since=${encodeURIComponent(since)}` : "/api/changes");
      const changed = reply.changed;
      if (changed && "all" in changed) {
        notesChanged(graph()?.nodes.map((n) => n.id) ?? []);
        chatsChanged([]);
      } else if (changed) {
        if (changed.notes.length > 0) notesChanged(changed.notes);
        if (changed.chats.length > 0) chatsChanged(changed.chats);
      }
      const latest = [reply.notes, reply.chats, since].filter((t) => t !== null).sort((a, b) => Date.parse(a) - Date.parse(b));
      since = latest.at(-1) ?? null;
      return reply;
    },
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 0,
  }));

/** Signed out: forget everything fetched, and where the poll was. */
export function forget() {
  since = null;
  queryClient.clear();
  batch(() => {
    setLoaded(false);
    setOverview({ summary: null, folders: [] });
    setGraph(null);
  });
}

// The vault

/** Whether the first fetch after signing in is done (whether or not it worked). */
export const [loaded, setLoaded] = createSignal(false);

/** The sidebar's and overview's view of the vault. Notes keep their place
 * in it from one update to the next (matched by id), so only what changed
 * is redrawn. */
export const [overview, setOverview] = createStore<{ summary: Overview["summary"] | null; folders: Overview["folders"] }>({
  summary: null,
  folders: [],
});
/** Every note and link, for the graphs: a new object each update. */
export const [graph, setGraph] = createSignal<GraphData | null>(null);
/** The notes the last update changed, and a count of updates. */
export const [changes, setChanges] = createSignal<{ ids: string[]; version: number }>({ ids: [], version: 0 });
export const [problem, setProblem] = createSignal<string | null>(null);

/** What the vault query brought: into the store (notes keep their place) and the graph. */
export function showVault(data: { overview: Overview; graph: GraphData } | undefined, error: Error | null) {
  if (error) {
    setProblem(error.message);
  } else if (data) {
    batch(() => {
      setOverview(reconcile(data.overview, { key: "id" }));
      // The query's data is a store (a proxy); the graph wants, and posts
      // to its worker, the plain object.
      setGraph(unwrap(data.graph));
      setChanges((c) => ({ ids: pending.splice(0), version: c.version + 1 }));
      setProblem(null);
    });
  }
  setLoaded(true);
}

// The notes the server said changed, until the vault query shows them.
const pending: string[] = [];

/** The server says these notes moved: the vault, the searches, and the
 * notes they touch are fetched again. */
function notesChanged(ids: string[]) {
  pending.push(...ids);
  queryClient.invalidateQueries({ queryKey: ["vault"] });
  queryClient.invalidateQueries({ queryKey: ["search"] });
  queryClient.invalidateQueries({
    queryKey: ["note"],
    predicate: (q) => touches(q.queryKey[1] as string, ids),
  });
}

// The chat history

/** The chats tiny-axe last wrote, and a count of writes. */
export const [chatChanges, setChatChanges] = createSignal<{ ids: string[]; version: number }>({ ids: [], version: 0 });

/** The server says these chats changed (none given: all of them). */
export function chatsChanged(ids: string[]) {
  setChatChanges((c) => ({ ids, version: c.version + 1 }));
  queryClient.invalidateQueries({ queryKey: ["chats"] });
  queryClient.invalidateQueries({
    queryKey: ["chat"],
    predicate: (q) => ids.length === 0 || ids.includes(q.queryKey[1] as string),
  });
}

/** Whether `ids` changed note `id` or a note linked to it, either way. */
export function touches(id: string, ids: string[]) {
  if (ids.includes(id)) return true;
  const g = graph();
  if (!g || ids.length === 0) return false;
  const at = g.nodes.findIndex((n) => n.id === id);
  const near = new Set(ids);
  return g.links.some(([a, b]) => (a === at && near.has(g.nodes[b].id)) || (b === at && near.has(g.nodes[a].id)));
}

// Where the page is

export type Route =
  | { kind: "graph"; focus: string | null }
  | { kind: "home" }
  | { kind: "note"; id: string }
  | { kind: "chat"; id: string };

const here = () => location.pathname + location.search;
// Not deduplicated: following a link to where the page is still counts.
export const [href, setHref] = createSignal(here(), { equals: false });
export const [menuOpen, setMenuOpen] = createSignal(false);

export function route(): Route {
  const url = new URL(href(), location.origin);
  const note = url.pathname.match(/^\/note\/(.+)$/);
  if (note) return { kind: "note", id: decodeURIComponent(note[1]) };
  const chat = url.pathname.match(/^\/chats\/(.+)$/);
  if (chat) return { kind: "chat", id: decodeURIComponent(chat[1]) };
  // The graph; and the home page, which was the graph (old links with ?focus=).
  if (url.pathname === "/graph" || url.searchParams.has("focus")) return { kind: "graph", focus: url.searchParams.get("focus") };
  return { kind: "home" };
}

export const ROUTES = (path: string) =>
  path === "/" || path === "/graph" || path === "/overview" || path.startsWith("/note/") || path === "/chats" || path.startsWith("/chats/");

export function go(to: string) {
  if (to !== here()) history.pushState(null, "", to);
  setMenuOpen(false);
  setHref(here());
  window.scrollTo(0, 0);
  document.getElementById("main")?.focus({ preventScroll: true });
}

window.addEventListener("popstate", () => setHref(here()));

// Small shared pieces

export const noteHref = (id: string) => `/note/${encodeURIComponent(id)}`;
export const chatHref = (id: string) => `/chats/${encodeURIComponent(id)}`;
export const graphHref = (id: string) => `/graph?focus=${encodeURIComponent(id)}`;
export const blocked = (e: { kind: string; gate?: string | null }) =>
  e.kind === "path" && (e.gate === "refused" || e.gate === "denied");

export const ORDER: Record<string, (a: Entry, b: Entry) => number> = {
  Tasks: (a, b) => (a.id < b.id ? 1 : -1),
};
export const byTitle = (a: Entry, b: Entry) => a.title.localeCompare(b.title);
export const sorted = (folder: string, notes: Entry[]) => [...notes].sort(ORDER[folder] ?? byTitle);
