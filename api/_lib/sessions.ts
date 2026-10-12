// The session graph (docs/plan-session-graph.md): every reviewed chat a
// node, linked to its category and to each concept the review tagged. It's
// drawn by the same viewer as the know-how graph, so it uses its node shape.

import type { Review } from "./store.js";
import type { GraphData, ViewNode } from "./vault/graph.js";

/** What a chat_push leaves that the session graph needs. */
export interface ChatHead {
  id: string;
  title: string;
  started: string;
  updated: string;
}

const CATEGORY = /^[a-z0-9][a-z0-9 _/-]{0,39}$/;
const CONCEPT = /^[a-z0-9][a-z0-9 _/.+#-]{0,39}$/;

/** A review as tiny-axe pushes it, checked and tidied, or a reason it's refused. */
export function parseReview(raw: unknown): { ok: true; review: Omit<Review, "owner"> } | { ok: false; reason: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: "a review must be an object" };
  const r = raw as Record<string, unknown>;
  if (typeof r.chat_id !== "string" || !/^\d{8}-\d{6}-[0-9a-f]{4}$/.test(r.chat_id)) return { ok: false, reason: "chat_id isn't a chat id" };
  const category = norm(typeof r.category === "string" ? r.category : "");
  if (!CATEGORY.test(category)) return { ok: false, reason: "category must be 1–40 plain characters" };
  if (!Array.isArray(r.concepts)) return { ok: false, reason: "concepts must be a list" };
  const concepts = [...new Set(r.concepts.filter((c): c is string => typeof c === "string").map(norm))].filter((c) => CONCEPT.test(c)).slice(0, 12);
  const summary = typeof r.summary === "string" ? r.summary.trim().slice(0, 500) : "";
  const reviewed_at = typeof r.reviewed_at === "string" && !Number.isNaN(Date.parse(r.reviewed_at)) ? r.reviewed_at : new Date().toISOString();
  return {
    ok: true,
    review: {
      chat_id: r.chat_id,
      summary,
      category,
      concepts,
      model: typeof r.model === "string" ? r.model.slice(0, 80) : null,
      decider: typeof r.decider === "string" ? r.decider.slice(0, 80) : null,
      reviewed_at,
    },
  };
}

/** Lower case, one space between words, trimmed. */
export const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

const node = (over: Partial<ViewNode> & Pick<ViewNode, "id" | "kind" | "title">): ViewNode => ({
  folder: "",
  trust: "observed",
  seen: null,
  gate: null,
  class: null,
  sites: [],
  drivers: [],
  first: null,
  last: null,
  ...over,
});

/** The graph: sessions, categories and concepts, with their links. Chats
 * without a review are left out; reviews whose chat is gone too. */
export function sessionGraph(chats: ChatHead[], reviews: Omit<Review, "owner">[]): GraphData {
  const byChat = new Map(chats.map((c) => [c.id, c]));
  const nodes: ViewNode[] = [];
  const index = new Map<string, number>();
  const links: [number, number][] = [];
  const touched = new Map<string, number>();

  const at = (id: string, make: () => ViewNode) => {
    let i = index.get(id);
    if (i === undefined) {
      i = nodes.length;
      index.set(id, i);
      nodes.push(make());
    }
    return i;
  };

  for (const review of reviews.sort((a, b) => (a.chat_id < b.chat_id ? -1 : 1))) {
    const chat = byChat.get(review.chat_id);
    if (!chat) continue;
    const day = chat.started.slice(0, 10);
    const s = at(`session:${review.chat_id}`, () =>
      node({
        id: `session:${review.chat_id}`,
        kind: "session",
        title: chat.title || "Untitled chat",
        folder: review.category,
        sites: [review.category],
        drivers: review.concepts,
        first: day,
        last: chat.updated.slice(0, 10),
        seen: null,
      }),
    );
    const c = at(`category:${review.category}`, () =>
      node({ id: `category:${review.category}`, kind: "category", title: review.category, folder: "Categories", seen: 0 }),
    );
    links.push([s, c]);
    touched.set(nodes[c].id, (touched.get(nodes[c].id) ?? 0) + 1);
    for (const concept of review.concepts) {
      const k = at(`concept:${concept}`, () => node({ id: `concept:${concept}`, kind: "concept", title: concept, folder: "Concepts", seen: 0 }));
      links.push([s, k]);
      touched.set(nodes[k].id, (touched.get(nodes[k].id) ?? 0) + 1);
    }
  }
  // Size categories and concepts by the sessions they touch.
  for (const n of nodes) if (n.kind !== "session") n.seen = touched.get(n.id) ?? 0;

  return { schema: "tiny-axe-sessions/1", nodes, links };
}
