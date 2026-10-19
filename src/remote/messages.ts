import type { Message } from "./types.ts";

type Updated = { id: string; updated_at: string };

/** Reconcile snapshots with broadcasts without rolling newer rows backward. */
export function mergeRows<T extends Updated>(current: readonly T[], incoming: readonly T[]): T[] {
  const rows = new Map(current.map(row => [row.id, row]));
  for (const row of incoming) {
    const previous = rows.get(row.id);
    if (!previous || row.updated_at > previous.updated_at) rows.set(row.id, row);
  }
  return [...rows.values()];
}

export function chronological(messages: Message[]): Message[] {
  return messages.sort((a, b) => a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id.localeCompare(b.id));
}
