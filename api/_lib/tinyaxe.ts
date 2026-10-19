// What the API does with tiny-axe's chats, for both ways in: the MCP
// endpoint (tiny-axe, with its key) and the site's pages (a signed-in viewer).

import type { Store } from "./store.js";
import { parseChat, type Chat } from "./chats/history.js";
import { secrets } from "./chats/redact.js";

/** A chat document's largest size. */
export const MAX_CHAT_BYTES = 2 * 1024 * 1024;

/** A refusal to show the caller: what was wrong with what it sent. */
export class Refused extends Error {}

/** Stores a chat if it changed. Only what the page shows is kept: never
 * `context`, and every text redacted again. */
export async function pushChat(store: Store, owner: string, doc: unknown): Promise<{ id: string; written: boolean }> {
  if (new TextEncoder().encode(JSON.stringify(doc ?? null)).byteLength > MAX_CHAT_BYTES) throw new Refused(`a chat is at most ${MAX_CHAT_BYTES} bytes`);
  const chat = parseChat(doc);
  if (!chat) throw new Refused("that isn't a tiny-axe chat (version 1, with id, session, title, started, updated, folder, entries)");

  const clean: Chat & { version: 1 } = {
    version: 1,
    ...chat,
    title: secrets(chat.title),
    entries: chat.entries.map((e) => ({ kind: e.kind, text: secrets(e.text) })),
  };
  const hash = await sha256(JSON.stringify(clean));
  if ((await store.chatHash(owner, chat.id)) === hash) return { id: chat.id, written: false };

  await store.putChat(owner, {
    id: chat.id,
    session: chat.session,
    title: clean.title,
    started: chat.started,
    updated: chat.updated,
    doc: clean,
    hash,
  });
  return { id: chat.id, written: true };
}

/** Every stored chat that still reads. */
export async function loadChats(store: Store, owner: string): Promise<Chat[]> {
  return (await store.chats(owner)).map(parseChat).filter((c) => c !== null);
}

export async function loadChat(store: Store, owner: string, id: string): Promise<Chat | null> {
  return parseChat(await store.chat(owner, id));
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
