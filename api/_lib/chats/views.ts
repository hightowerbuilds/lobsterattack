// What the site's pages and the MCP tools are sent about the chats: the list
// (searchable), one chat as the page shows it, and one as plain text.

import { renderChat } from "./render.js";
import { sessionStart, type Chat } from "./history.js";

/** The chats chat_search gives at most. */
export const MAX_SEARCH_RESULTS = 20;
/** The longest chat_read gives, in characters. */
export const MAX_READ_CHARS = 20_000;

// Every chat, by the session it started in: the newest sessions first, and
// the newest chats first within each. With a query, only the chats that have
// every word, each with a snippet from the first message that has one.
export function chatList(all: Chat[], query: string) {
  const words = toWords(query);
  const sessions = new Map<string, { id: string; started: string; chats: unknown[] }>();

  for (const chat of [...all].sort((a, b) => compare(b.id, a.id))) {
    let found: string | undefined;
    if (words.length > 0) {
      found = match(chat, words);
      if (found === undefined) continue;
    }

    if (!sessions.has(chat.session)) {
      sessions.set(chat.session, { id: chat.session, started: sessionStart(chat.session) ?? chat.started, chats: [] });
    }
    const session = sessions.get(chat.session)!;
    if (chat.started < session.started) session.started = chat.started;
    session.chats.push({
      id: chat.id,
      title: chat.title,
      started: chat.started,
      updated: chat.updated,
      folder: chat.folder,
      messages: chat.entries.filter((e) => e.kind !== "meta").length,
      ...(found === undefined ? {} : { snippet: found }),
    });
  }

  return {
    total: all.length,
    sessions: [...sessions.values()].sort((a, b) => compare(b.started, a.started) || compare(b.id, a.id)),
  };
}

// The chats that have every word of the query (as the list matches them),
// the most recently updated first, at most MAX_SEARCH_RESULTS.
export function chatSearch(all: Chat[], query: string) {
  const words = toWords(query);
  if (words.length === 0) return [];
  const results = [];
  for (const chat of all) {
    const snippet = match(chat, words);
    if (snippet === undefined) continue;
    results.push({ id: chat.id, title: chat.title, started: chat.started, updated: chat.updated, snippet });
  }
  return results
    .sort((a, b) => compare(b.updated, a.updated) || compare(b.id, a.id))
    .slice(0, MAX_SEARCH_RESULTS);
}

// One chat as the page shows it: the user's and tiny-axe's messages as
// HTML, activity lines as text. Never what reopening it gives the model.
export function chatDetail(chat: Chat) {
  return {
    id: chat.id,
    session: chat.session,
    title: chat.title,
    started: chat.started,
    updated: chat.updated,
    folder: chat.folder,
    entries: chat.entries.map((e) => (e.kind === "meta" ? { ...e } : { ...e, html: renderChat(e.text) })),
  };
}

// One chat as plain text, for the model (chat_read): its title and times,
// then each message as "user:" or "tiny-axe:", activity lines left out. Cut
// at MAX_READ_CHARS, saying so.
export function chatText(chat: Chat): string {
  const head = [
    `title: ${chat.title || "Untitled chat"}`,
    `id: ${chat.id}`,
    `started: ${chat.started}`,
    `updated: ${chat.updated}`,
    `folder: ${chat.folder}`,
  ].join("\n");
  const messages = chat.entries
    .filter((e) => e.kind !== "meta")
    .map((e) => `${e.kind === "user" ? "user" : "tiny-axe"}: ${e.text.trim()}`);
  const text = [head, ...messages].join("\n\n");
  if (text.length <= MAX_READ_CHARS) return text;
  return (
    text.slice(0, MAX_READ_CHARS).trimEnd() +
    `\n\n[cut: the chat is ${text.length} characters, and only the first ${MAX_READ_CHARS} are shown]`
  );
}

const toWords = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean);

// Whether every word is somewhere in the chat's entries: if so, a snippet
// from the first entry that has one of them; if not, undefined.
function match(chat: Chat, words: string[]): string | undefined {
  const texts = chat.entries.map((e) => (e.kind === "meta" ? e.text : unmark(e.text)).replace(/\s+/g, " "));
  const lower = texts.map((t) => t.toLowerCase());
  if (!words.every((w) => lower.some((t) => t.includes(w)))) return undefined;
  return snippet(texts[lower.findIndex((t) => words.some((w) => t.includes(w)))], words);
}

// A chat message's Markdown as plain text, for search and snippets: the
// marks that would show as stray characters dropped.
function unmark(text: string): string {
  return text
    .replace(/^```.*$/gm, " ")
    .replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, "$1")
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*(#+|>|[-*]|\d+\.) /gm, "");
}

// Up to ~120 characters of the text around the first word it contains (or
// its start), cut at spaces.
function snippet(text: string, words: string[]): string {
  const lower = text.toLowerCase();
  const hits = words.map((w) => lower.indexOf(w)).filter((i) => i >= 0);
  const at = hits.length > 0 ? Math.min(...hits) : 0;
  let from = Math.max(0, at - 40);
  if (from > 0) {
    const space = text.indexOf(" ", from);
    from = space >= 0 && space < at ? space + 1 : at;
  }
  let to = Math.min(text.length, from + 120);
  if (to < text.length) to = text.lastIndexOf(" ", to) > at ? text.lastIndexOf(" ", to) : to;
  return (from > 0 ? "…" : "") + text.slice(from, to).trim() + (to < text.length ? "…" : "");
}

// Plain string order (ids and times are ASCII; localeCompare would depend on
// the locale).
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
