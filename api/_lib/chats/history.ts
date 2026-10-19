// tiny-axe's chats (tiny-axe docs/plan-history.md): one JSON document per
// chat, as tiny-axe's History writes it. The site keeps only what the page
// shows. What reopening a chat gives the model (`context`) is dropped here,
// so it's never stored.

/** The time a chat (or a session) started, UTC, and four hex digits. */
export const CHAT_ID = /^\d{8}-\d{6}-[0-9a-f]{4}$/;

const VERSION = 1;
const KINDS = new Set(["user", "assistant", "meta"]);

export interface ChatEntry {
  kind: "user" | "assistant" | "meta";
  text: string;
}

export interface Chat {
  id: string;
  session: string;
  title: string;
  started: string;
  updated: string;
  folder: string;
  entries: ChatEntry[];
}

/** A session's start, from its id; null if the id isn't one. */
export function sessionStart(session: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-[0-9a-f]{4}$/.exec(session);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
}

/** A chat document, or null if it isn't one the site reads. Entries of a
 * kind it doesn't know are left out. */
export function parseChat(value: unknown): Chat | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const doc = value as Record<string, unknown>;
  const { id, session, title, started, updated, folder, entries } = doc;
  if (doc.version !== VERSION || typeof id !== "string" || !CHAT_ID.test(id)) return null;
  if (typeof session !== "string" || typeof title !== "string" || typeof started !== "string" ||
      typeof updated !== "string" || typeof folder !== "string" || !Array.isArray(entries)) return null;
  const kept: ChatEntry[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    if (KINDS.has(entry.kind) && typeof entry.text === "string") kept.push({ kind: entry.kind, text: entry.text });
  }
  return { id, session, title, started, updated, folder, entries: kept };
}
