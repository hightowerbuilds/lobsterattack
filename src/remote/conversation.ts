import { createSignal } from "solid-js";
import { session } from "../auth.ts";
import { agent, type Agent } from "../navigation.ts";

type Conversation = { id: string | null; revision: number };
const [saved, setSaved] = createSignal<Record<string, Conversation>>({});
export const scope = (target: Agent) => `remote-conversation:${session()?.user.id ?? "signed-out"}:${target}`;

export function conversation(target: Agent): Conversation {
  const key = scope(target);
  if (saved()[key]) return saved()[key];
  let id = null;
  try { id = sessionStorage.getItem(key); } catch { /* Optional tab storage. */ }
  return { id, revision: 0 };
}

export function setConversation(id: string | null, target: Agent) {
  const key = scope(target);
  // A new chat invalidates in-flight sends even when the previous id was null.
  const revision = conversation(target).revision + (id === null ? 1 : 0);
  setSaved(was => ({ ...was, [key]: { id, revision } }));
  try {
    if (id) sessionStorage.setItem(key, id);
    else sessionStorage.removeItem(key);
  } catch { /* Optional tab storage. */ }
}

export const newChat = () => setConversation(null, agent());
