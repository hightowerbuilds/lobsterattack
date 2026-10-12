// Where tiny-axe's notes and chats are kept: the `buster_ta_*` tables
// (supabase/migrations/0006_buster_ta.sql), reached with the service-role key
// after the API has checked who's asking. Every read and write is for one
// owner. Tests use `memoryStore()` instead.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NoteFile } from "./vault/vault.js";

export interface StoredNote extends NoteFile {
  kind: string;
  title: string;
  hash: string;
  /** "push" from tiny-axe's vault writer, "agent" from the model. */
  source: "push" | "agent";
}

export interface StoredChat {
  id: string;
  session: string;
  title: string;
  started: string;
  updated: string;
  /** The chat as the site reads it (`parseChat`), redacted. */
  doc: unknown;
  hash: string;
}

export interface Changes {
  /** When a note or a chat was last written, ISO 8601; null for none yet. */
  notes: string | null;
  chats: string | null;
}

export interface Store {
  /** The owner a live (unrevoked) agent key's SHA-256 belongs to. */
  ownerForKey(keyHash: string): Promise<string | null>;
  /** The owner whose site a signed-in user may see; null if they may see none. */
  ownerForViewer(userId: string): Promise<string | null>;
  manifest(owner: string): Promise<Record<string, unknown> | null>;
  notes(owner: string): Promise<NoteFile[]>;
  noteHashes(owner: string, ids: string[]): Promise<Map<string, string>>;
  putNotes(owner: string, notes: StoredNote[]): Promise<void>;
  putManifest(owner: string, manifest: Record<string, unknown>): Promise<void>;
  chats(owner: string): Promise<unknown[]>;
  chat(owner: string, id: string): Promise<unknown | null>;
  chatHash(owner: string, id: string): Promise<string | null>;
  putChat(owner: string, chat: StoredChat): Promise<void>;
  changes(owner: string): Promise<Changes>;
}

// PostgREST gives at most 1,000 rows per request.
const PAGE = 1000;
// Rows per upsert, to keep each request small.
const BATCH = 200;

export function supabaseStore(db: SupabaseClient): Store {
  async function every<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>) {
    const rows: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await page(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) return rows;
    }
  }

  async function latest(table: string, owner: string): Promise<string | null> {
    const { data, error } = await db
      .from(table)
      .select("updated_at")
      .eq("owner_id", owner)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data?.updated_at ?? null;
  }

  return {
    async ownerForKey(keyHash) {
      const { data, error } = await db
        .from("buster_ta_keys")
        .select("id, owner_id")
        .eq("key_hash", keyHash)
        .is("revoked_at", null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      // Best effort: a failed note of when it was used doesn't refuse the call.
      await db.from("buster_ta_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
      return data.owner_id;
    },

    async ownerForViewer(userId) {
      const { data, error } = await db
        .from("buster_ta_members")
        .select("owner_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data?.owner_id ?? null;
    },

    async manifest(owner) {
      const { data, error } = await db.from("buster_ta_vault").select("manifest").eq("owner_id", owner).maybeSingle();
      if (error) throw new Error(error.message);
      return data?.manifest ?? null;
    },

    async notes(owner) {
      const rows = await every<{ id: string; folder: string; text: string }>((from, to) =>
        db.from("buster_ta_notes").select("id, folder, text").eq("owner_id", owner).order("id").range(from, to),
      );
      return rows;
    },

    async noteHashes(owner, ids) {
      const hashes = new Map<string, string>();
      for (let i = 0; i < ids.length; i += BATCH) {
        const { data, error } = await db
          .from("buster_ta_notes")
          .select("id, hash")
          .eq("owner_id", owner)
          .in("id", ids.slice(i, i + BATCH));
        if (error) throw new Error(error.message);
        for (const row of data ?? []) hashes.set(row.id, row.hash);
      }
      return hashes;
    },

    async putNotes(owner, notes) {
      const at = new Date().toISOString();
      for (let i = 0; i < notes.length; i += BATCH) {
        const rows = notes.slice(i, i + BATCH).map((n) => ({
          owner_id: owner,
          id: n.id,
          folder: n.folder,
          kind: n.kind,
          title: n.title,
          text: n.text,
          hash: n.hash,
          source: n.source,
          updated_at: at,
        }));
        const { error } = await db.from("buster_ta_notes").upsert(rows, { onConflict: "owner_id,id" });
        if (error) throw new Error(error.message);
      }
    },

    async putManifest(owner, manifest) {
      const { error } = await db
        .from("buster_ta_vault")
        .upsert({ owner_id: owner, manifest, updated_at: new Date().toISOString() }, { onConflict: "owner_id" });
      if (error) throw new Error(error.message);
    },

    async chats(owner) {
      const rows = await every<{ doc: unknown }>((from, to) =>
        db.from("buster_ta_chats").select("doc").eq("owner_id", owner).order("id").range(from, to),
      );
      return rows.map((r) => r.doc);
    },

    async chat(owner, id) {
      const { data, error } = await db
        .from("buster_ta_chats")
        .select("doc")
        .eq("owner_id", owner)
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data?.doc ?? null;
    },

    async chatHash(owner, id) {
      const { data, error } = await db
        .from("buster_ta_chats")
        .select("hash")
        .eq("owner_id", owner)
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data?.hash ?? null;
    },

    async putChat(owner, chat) {
      const { error } = await db
        .from("buster_ta_chats")
        .upsert({ owner_id: owner, ...chat, updated_at: new Date().toISOString() }, { onConflict: "owner_id,id" });
      if (error) throw new Error(error.message);
    },

    async changes(owner) {
      const [notes, chats] = await Promise.all([latest("buster_ta_notes", owner), latest("buster_ta_chats", owner)]);
      return { notes, chats };
    },
  };
}

/** The same, in memory: for tests and trying the API without Supabase. */
export function memoryStore(seed: {
  keys?: Record<string, string>;
  members?: Record<string, string>;
} = {}): Store & { notesWritten: number } {
  const keys = new Map(Object.entries(seed.keys ?? {}));
  const members = new Map(Object.entries(seed.members ?? {}));
  const manifests = new Map<string, Record<string, unknown>>();
  const notes = new Map<string, Map<string, StoredNote & { at: string }>>();
  const chats = new Map<string, Map<string, StoredChat & { at: string }>>();
  const of = <T>(m: Map<string, Map<string, T>>, owner: string) => {
    if (!m.has(owner)) m.set(owner, new Map());
    return m.get(owner)!;
  };
  // Strictly increasing, so a test sees every write as a change.
  let clock = Date.parse("2026-10-11T00:00:00Z");
  const now = () => new Date((clock += 1000)).toISOString();
  const newest = (rows: Iterable<{ at: string }>) => [...rows].map((r) => r.at).sort().at(-1) ?? null;

  const store = {
    notesWritten: 0,
    ownerForKey: async (hash: string) => keys.get(hash) ?? null,
    ownerForViewer: async (user: string) => members.get(user) ?? null,
    manifest: async (owner: string) => manifests.get(owner) ?? null,
    notes: async (owner: string) => [...of(notes, owner).values()].map(({ id, folder, text }) => ({ id, folder, text })),
    noteHashes: async (owner: string, ids: string[]) => {
      const mine = of(notes, owner);
      return new Map(ids.filter((id) => mine.has(id)).map((id) => [id, mine.get(id)!.hash]));
    },
    putNotes: async (owner: string, rows: StoredNote[]) => {
      const mine = of(notes, owner);
      for (const row of rows) mine.set(row.id, { ...row, at: now() });
      store.notesWritten += rows.length;
    },
    putManifest: async (owner: string, manifest: Record<string, unknown>) => void manifests.set(owner, manifest),
    chats: async (owner: string) => [...of(chats, owner).values()].map((c) => c.doc),
    chat: async (owner: string, id: string) => of(chats, owner).get(id)?.doc ?? null,
    chatHash: async (owner: string, id: string) => of(chats, owner).get(id)?.hash ?? null,
    putChat: async (owner: string, chat: StoredChat) => void of(chats, owner).set(chat.id, { ...chat, at: now() }),
    changes: async (owner: string) => ({
      notes: newest(of(notes, owner).values()),
      chats: newest(of(chats, owner).values()),
    }),
  };
  return store;
}
