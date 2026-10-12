// What the site's pages are sent: the same JSON shapes tiny-axe's local viewer
// served (graph/src/server.ts), so its pages move over unchanged.

import { FOLDERS } from "./format.js";
import { compare, type Vault, type VaultNote } from "./vault.js";
import { renderChat, renderer } from "./render.js";
import { sessionStart, type Chat } from "./history.js";

export { graphView } from "./graph.js";

export function rendererFor(vault: Vault) {
  return renderer((id) => vault.notes.get(id));
}

// What the sidebar and the home page need.
export function overview(vault: Vault) {
  const notes = [...vault.notes.values()];
  const count = (kind: string) => notes.filter((n) => n.kind === kind).length;
  const blocked = notes.filter((n) => n.kind === "path" && ["refused", "denied"].includes(String(prop(n, "gate"))));

  const folders = new Map<string, unknown[]>();
  for (const note of notes) {
    if (!folders.has(note.folder)) folders.set(note.folder, []);
    folders.get(note.folder)!.push(entry(note));
  }

  return {
    schema: vault.manifest.schema,
    summary: {
      sites: count("site"),
      pages: count("page"),
      controls: count("control"),
      paths: count("path"),
      blocked: blocked.length,
      tools: count("tool"),
      tasks: count("task"),
      notes: count("note"),
    },
    // In the vault's own order (sites first), skipping empty folders.
    folders: Object.values(FOLDERS)
      .filter((name) => folders.has(name))
      .map((name) => ({ name, notes: folders.get(name)! })),
  };
}

function entry(note: VaultNote) {
  return {
    id: note.id,
    title: note.title,
    kind: note.kind,
    trust: note.trust,
    gate: prop(note, "gate") ?? null,
    seen: prop(note, "seen") ?? null,
    last_seen: prop(note, "last_seen") ?? prop(note, "started") ?? null,
  };
}

export function detail(vault: Vault, note: VaultNote, render: (md: string) => string) {
  // Values that name another note (a site's key, a task id) become links.
  const refs: Record<string, { id: string; title: string; kind: string }> = {};
  for (const [, value] of note.props) {
    for (const v of Array.isArray(value) ? value : [value]) {
      const id = typeof v === "string" ? vault.byKey.get(v) : undefined;
      const target = id && id !== note.id ? vault.notes.get(id) : undefined;
      if (target) refs[v as string] = { id: target.id, title: target.title, kind: target.kind };
    }
  }

  const grouped = new Map<string, unknown[]>();
  for (const id of vault.backlinks.get(note.id) ?? []) {
    const from = vault.notes.get(id);
    if (!from) continue;
    if (!grouped.has(from.folder)) grouped.set(from.folder, []);
    grouped.get(from.folder)!.push(entry(from));
  }

  return {
    ...entry(note),
    folder: note.folder,
    props: note.props,
    refs,
    html: render(note.body),
    links: note.links.filter((id) => vault.notes.has(id)),
    backlinks: [...grouped].map(([folder, notes]) => ({ folder, notes })),
  };
}

export function search(vault: Vault, query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const results = [];
  for (const note of vault.notes.values()) {
    const title = note.title.toLowerCase();
    const text = plain(note.body);
    const lower = text.toLowerCase();
    if (!words.every((w) => title.includes(w) || lower.includes(w))) continue;

    const inTitle = words.every((w) => title.includes(w));
    results.push({ ...entry(note), folder: note.folder, snippet: snippet(text, words), inTitle });
  }

  return results.sort((a, b) => Number(b.inTitle) - Number(a.inTitle)).slice(0, 50);
}

// Every chat, by the session it started in: the newest sessions first, and
// the newest chats first within each. With a query, only the chats that have
// every word, each with a snippet from the first message that has one.
export function chatList(all: Chat[], query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const sessions = new Map<string, { id: string; started: string; chats: unknown[] }>();

  for (const chat of [...all].sort((a, b) => compare(b.id, a.id))) {
    let found: string | undefined;
    if (words.length > 0) {
      const texts = chat.entries.map((e) => (e.kind === "meta" ? e.text : unmark(e.text)).replace(/\s+/g, " "));
      const lower = texts.map((t) => t.toLowerCase());
      if (!words.every((w) => lower.some((t) => t.includes(w)))) continue;
      found = snippet(texts[lower.findIndex((t) => words.some((w) => t.includes(w)))], words);
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

// A chat message's Markdown as plain text, for search and snippets: the
// marks that would show as stray characters dropped.
function unmark(text: string): string {
  return text
    .replace(/^```.*$/gm, " ")
    .replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, "$1")
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*(#+|>|[-*]|\d+\.) /gm, "");
}

// Up to ~120 characters of the body around the first word it contains (or
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

// A body as plain text, without its title: link aliases kept, markup and
// escapes dropped.
function plain(body: string): string {
  return body
    .replace(/^\s*# .*\n/, "")
    .replace(/\[\[[^\[\]|\n]+\|([^\[\]\n]*)\]\]/g, "$1")
    .replace(/\[\[([^\[\]|\n]+)\]\]/g, "$1")
    .replace(/\\(.)/g, "$1")
    .replace(/^#+ |^\d+\. |^- |\|/gm, " ")
    .replace(/\s+/g, " ");
}

function prop(note: VaultNote, name: string) {
  return note.props.find(([n]) => n === name)?.[1];
}

