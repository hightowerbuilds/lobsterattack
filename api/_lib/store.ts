// Where tiny-axe's chats (and who may see them) are kept: the `buster_ta_*`
// tables (supabase/migrations/0006_buster_ta.sql), reached with the service-role key
// after the API has checked who's asking. Every read and write is for one
// owner. Tests use `memoryStore()` instead.

import type { SupabaseClient } from "@supabase/supabase-js";
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
  /** When a chat was last written, ISO 8601; null for none yet. */
  chats: string | null;
}

/** The chats written after a time, up to a limit. */
export interface Changed {
  chats: string[];
}

export interface Store {
  /** The owner a live (unrevoked) agent key's SHA-256 belongs to. */
  ownerForKey(keyHash: string): Promise<string | null>;
  /** The owner whose site a signed-in user may see; null if they may see none. */
  ownerForViewer(userId: string): Promise<string | null>;
  chats(owner: string): Promise<unknown[]>;
  chat(owner: string, id: string): Promise<unknown | null>;
  chatHash(owner: string, id: string): Promise<string | null>;
  putChat(owner: string, chat: StoredChat): Promise<void>;
  changes(owner: string): Promise<Changes>;
  changedSince(owner: string, since: string, limit: number): Promise<Changed>;

  // Accounts (POST /api/signup, /api/device)
  usernameTaken(username: string): Promise<boolean>;
  /** Records an account's username; false if someone has it already. */
  addAccount(userId: string, username: string): Promise<boolean>;
  addMember(userId: string, owner: string, role: "owner" | "viewer"): Promise<void>;
  /** Stores a key's SHA-256 for an owner; the key's id. */
  addKey(owner: string, keyHash: string, label: string): Promise<string>;
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
      return { chats: await latest("buster_ta_chats", owner) };
    },

    async changedSince(owner, since, limit) {
      const { data, error } = await db
        .from("buster_ta_chats")
        .select("id")
        .eq("owner_id", owner)
        .gt("updated_at", since)
        .limit(limit);
      if (error) throw new Error(error.message);
      return { chats: (data ?? []).map((r: { id: string }) => r.id) };
    },

    async usernameTaken(username) {
      const { data, error } = await db.from("buster_ta_accounts").select("user_id").eq("username", username).maybeSingle();
      if (error) throw new Error(error.message);
      return data !== null;
    },

    async addAccount(userId, username) {
      const { error } = await db.from("buster_ta_accounts").insert({ user_id: userId, username });
      // 23505: the username (or the user) is already there.
      if (error?.code === "23505") return false;
      if (error) throw new Error(error.message);
      return true;
    },

    async addMember(userId, owner, role) {
      const { error } = await db
        .from("buster_ta_members")
        .upsert({ user_id: userId, owner_id: owner, role }, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
    },

    async addKey(owner, keyHash, label) {
      const { data, error } = await db
        .from("buster_ta_keys")
        .insert({ owner_id: owner, key_hash: keyHash, label })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return data.id;
    },
  };
}

/** The same, in memory: for tests and trying the API without Supabase. */
export function memoryStore(seed: {
  keys?: Record<string, string>;
  members?: Record<string, string>;
} = {}): Store {
  const keys = new Map(Object.entries(seed.keys ?? {}));
  const members = new Map(Object.entries(seed.members ?? {}));
  const usernames = new Map<string, string>();
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
    ownerForKey: async (hash: string) => keys.get(hash) ?? null,
    ownerForViewer: async (user: string) => members.get(user) ?? null,
    chats: async (owner: string) => [...of(chats, owner).values()].map((c) => c.doc),
    chat: async (owner: string, id: string) => of(chats, owner).get(id)?.doc ?? null,
    chatHash: async (owner: string, id: string) => of(chats, owner).get(id)?.hash ?? null,
    putChat: async (owner: string, chat: StoredChat) => void of(chats, owner).set(chat.id, { ...chat, at: now() }),
    changes: async (owner: string) => ({ chats: newest(of(chats, owner).values()) }),
    changedSince: async (owner: string, since: string, limit: number) => ({
      chats: [...of(chats, owner).values()].filter((c) => c.at > since).slice(0, limit).map((c) => c.id),
    }),
    usernameTaken: async (username: string) => usernames.has(username),
    addAccount: async (userId: string, username: string) => {
      if (usernames.has(username)) return false;
      usernames.set(username, userId);
      return true;
    },
    addMember: async (userId: string, owner: string) => void members.set(userId, owner),
    addKey: async (owner: string, keyHash: string) => {
      keys.set(keyHash, owner);
      return `key-${keys.size}`;
    },
  };
  return store;
}
