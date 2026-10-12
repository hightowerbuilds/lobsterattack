// What the API does with tiny-axe's notes and chats, for both ways in: the
// MCP endpoint (tiny-axe, with its key) and the site's pages (a signed-in
// viewer).

import type { Store, StoredNote } from "./store.js";
import { escapeText, FOLDERS, hash8, SCHEMA, slug } from "./vault/format.js";
import { buildVault, readNote, type NoteFile, type Vault, type VaultNote } from "./vault/vault.js";
import { parseChat, type Chat } from "./vault/history.js";
import { cards, secrets } from "./vault/redact.js";

/** Notes per vault_push, so one request stays well under Vercel's body limit. */
export const MAX_NOTES_PER_PUSH = 200;
/** A note file's largest size; tiny-axe's are under 2 KB. */
export const MAX_NOTE_BYTES = 64 * 1024;
/** A chat document's largest size. */
export const MAX_CHAT_BYTES = 2 * 1024 * 1024;

/** A refusal to show the caller: what was wrong with what it sent. */
export class Refused extends Error {}

/** The owner's vault, from the stored notes. A stored note that no longer
 * reads is left out rather than failing the rest. */
export async function loadVault(store: Store, owner: string): Promise<Vault> {
  const [manifest, files] = await Promise.all([store.manifest(owner), store.notes(owner)]);
  const notes: VaultNote[] = [];
  for (const file of files) {
    try {
      notes.push(readNote(file));
    } catch {
      // Written by an older version of the rules; skipped until pushed again.
    }
  }
  return buildVault(manifest ?? {}, notes);
}

export interface PushResult {
  written: number;
  unchanged: number;
  refused: { id: string; reason: string }[];
}

/** Stores the notes whose text changed. A note that doesn't read is refused
 * (and said so), and the others still go in. */
export async function pushNotes(
  store: Store,
  owner: string,
  manifest: unknown,
  files: unknown,
  source: StoredNote["source"] = "push",
): Promise<PushResult> {
  if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
    throw new Refused("manifest must be the vault's manifest object");
  }
  const schema = (manifest as Record<string, unknown>).schema;
  if (schema !== SCHEMA) throw new Refused(`this site reads ${SCHEMA}, and the vault is ${JSON.stringify(schema)}`);
  if (!Array.isArray(files)) throw new Refused("notes must be a list of {folder, id, text}");
  if (files.length > MAX_NOTES_PER_PUSH) throw new Refused(`at most ${MAX_NOTES_PER_PUSH} notes per push`);

  const refused: PushResult["refused"] = [];
  const ready: StoredNote[] = [];
  const seen = new Set<string>();

  for (const raw of files) {
    const id = typeof raw?.id === "string" ? raw.id : "?";
    if (typeof raw?.folder !== "string" || typeof raw?.id !== "string" || typeof raw?.text !== "string") {
      refused.push({ id, reason: "a note is {folder, id, text}, all strings" });
      continue;
    }
    if (seen.has(id)) {
      refused.push({ id, reason: "sent twice in one push" });
      continue;
    }
    seen.add(id);
    if (new TextEncoder().encode(raw.text).length > MAX_NOTE_BYTES) {
      refused.push({ id, reason: `longer than ${MAX_NOTE_BYTES} bytes` });
      continue;
    }

    const file: NoteFile = { folder: raw.folder, id, text: cards(raw.text) };
    try {
      const note = readNote(file);
      ready.push({ ...file, kind: note.kind, title: note.title, hash: await sha256(file.text), source });
    } catch (error) {
      refused.push({ id, reason: (error as Error).message });
    }
  }

  const known = await store.noteHashes(owner, ready.map((n) => n.id));
  const changed = ready.filter((n) => known.get(n.id) !== n.hash);
  if (changed.length > 0) await store.putNotes(owner, changed);
  // The manifest goes in after the notes, as the vault writer orders its files.
  await store.putManifest(owner, manifest as Record<string, unknown>);

  return { written: changed.length, unchanged: ready.length - changed.length, refused };
}

/** A model's note's longest title and body. */
export const MAX_TITLE = 120;
export const MAX_BODY = 20_000;

/**
 * A note the model writes (graph_add_note), in the Notes folder of the
 * owner's vault on the site. The same title is the same note: writing it
 * again replaces the model's earlier text. It never replaces a note tiny-axe's
 * vault writer sent (those are in other folders). Card numbers are removed.
 */
export async function addNote(
  store: Store,
  owner: string,
  input: { title: unknown; body: unknown },
): Promise<{ id: string; written: boolean }> {
  if (typeof input.title !== "string" || input.title.trim() === "") throw new Refused("a note needs a title");
  if (typeof input.body !== "string" || input.body.trim() === "") throw new Refused("a note needs a body");
  const title = input.title.replace(/\s+/g, " ").trim();
  if (title.length > MAX_TITLE) throw new Refused(`a title is at most ${MAX_TITLE} characters`);
  if (input.body.length > MAX_BODY) throw new Refused(`a body is at most ${MAX_BODY} characters`);

  const id = `${slug(title)} ${await hash8("note", title)}`;
  const body = input.body.replace(/\r\n?/g, "\n").trim();
  const day = new Date().toISOString().slice(0, 10);
  const text =
    [
      "---",
      `kind: ${JSON.stringify("note")}`,
      `key: ${JSON.stringify(title)}`,
      `title: ${JSON.stringify(title)}`,
      `trust: ${JSON.stringify("observed")}`,
      `source: ${JSON.stringify("agent")}`,
      `updated: ${JSON.stringify(day)}`,
      "---",
      "",
      `# ${escapeText(title)}`,
      "",
      body,
    ].join("\n") + "\n";

  const manifest = (await store.manifest(owner)) ?? { schema: SCHEMA };
  const result = await pushNotes(store, owner, manifest, [{ folder: FOLDERS.note, id, text }], "agent");
  if (result.refused.length > 0) throw new Refused(result.refused[0].reason);
  return { id, written: result.written > 0 };
}

/** Stores a chat if it changed. Only what the page shows is kept: never
 * `context`, and every text redacted again. */
export async function pushChat(store: Store, owner: string, doc: unknown): Promise<{ id: string; written: boolean }> {
  if (JSON.stringify(doc ?? null).length > MAX_CHAT_BYTES) throw new Refused(`a chat is at most ${MAX_CHAT_BYTES} bytes`);
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
