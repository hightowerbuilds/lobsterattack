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
import { accessToken, session, signOut } from "../auth.ts";

interface ChatRow {
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
async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const owner = session()?.user.id;
  const token = await accessToken();
  signal?.throwIfAborted();
  if (session()?.user.id !== owner) throw new DOMException("Account changed", "AbortError");
  if (!token) {
    await signOut();
    throw new Error("Sign in to see this.");
  }
  const res = await fetch(path, { signal, headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
  if (session()?.user.id !== owner) throw new DOMException("Account changed", "AbortError");
  if (res.status === 401) {
    await signOut();
    throw new Error("Sign in to see this.");
  }
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `The server said ${res.status}.`);
  return res.json() as Promise<T>;
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
    queryFn: ({ signal }) => get<ChatList>(q() ? `/api/chats?q=${encodeURIComponent(q())}` : "/api/chats", signal),
    placeholderData: keepPreviousData,
  }), () => queryClient);

export const chatQuery = (id: () => string) =>
  useQuery(() => ({
    queryKey: ["chat", id()],
    queryFn: ({ signal }) => get<ChatDetail>(`/api/chat?id=${encodeURIComponent(id())}`, signal),
    placeholderData: keepPreviousData,
  }), () => queryClient);

// tiny-axe pushes chats as they go on. The page asks every POLL_MS what
// changed since it last asked (not while the tab is hidden), and the API says
// which chats; those queries are then stale, and whatever's showing them
// fetches again.
const POLL_MS = 15_000;

interface ChangesReply {
  chats: string | null;
  changed?: { chats: string[] } | { all: true };
}

let since: string | null = null;

export const changesQuery = () =>
  useQuery(() => ({
    queryKey: ["changes"],
    queryFn: async ({ signal }) => {
      const reply = await get<ChangesReply>(since ? `/api/changes?since=${encodeURIComponent(since)}` : "/api/changes", signal);
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
function chatsChanged(ids: string[]) {
  queryClient.invalidateQueries({ queryKey: ["chats"] });
  queryClient.invalidateQueries({
    queryKey: ["chat"],
    predicate: (q) => ids.length === 0 || ids.includes(q.queryKey[1] as string),
  });
}
