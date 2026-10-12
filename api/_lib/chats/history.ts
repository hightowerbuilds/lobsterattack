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
export function parseChat(doc: any): Chat | null {
  if (typeof doc !== "object" || doc === null || doc.version !== VERSION) return null;
  if (typeof doc.id !== "string" || !CHAT_ID.test(doc.id)) return null;
  const strings = ["session", "title", "started", "updated", "folder"].every((k) => typeof doc[k] === "string");
  if (!strings || !Array.isArray(doc.entries)) return null;

  const entries: ChatEntry[] = doc.entries
    .filter((e: any) => typeof e === "object" && e !== null && KINDS.has(e.kind) && typeof e.text === "string")
    .map((e: ChatEntry) => ({ kind: e.kind, text: e.text }));
  return {
    id: doc.id,
    session: doc.session,
    title: doc.title,
    started: doc.started,
    updated: doc.updated,
    folder: doc.folder,
    entries,
  };
}
