import type { Store, StoredChat } from "../../api/_lib/store.ts";

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
