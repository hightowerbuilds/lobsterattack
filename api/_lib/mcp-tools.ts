import { discussionCard, drawing, VISUAL_GUIDE } from "./chats/visuals.js";
import { CHAT_ID } from "./chats/history.js";
import { chatSearch, chatText, MAX_READ_CHARS, MAX_SEARCH_RESULTS } from "./chats/views.js";
import { loadChat, loadChats, pushChat, Refused } from "./tinyaxe.js";
import type { Deps } from "../_routes/tinyaxe.js";

type Result = { content: { type: "text"; text: string }[]; isError?: boolean };
export type Ctx = { owner: string; deps: Deps; origin: string };

interface Tool {
  description: string;
  inputSchema: object;
  annotations: object;
  run(args: Record<string, unknown>, ctx: Ctx): Promise<Result>;
}

const READ = { readOnlyHint: true, openWorldHint: false };
const PUSH = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export const text = (t: string): Result => ({ content: [{ type: "text", text: t }] });
const json = (v: unknown): Result => text(JSON.stringify(v, null, 1));

// The site's page for the chat list, or for one chat.
function sitePath(chat: unknown): string {
  if (chat === undefined || chat === null || chat === "") return "/chats";
  if (typeof chat !== "string" || !CHAT_ID.test(chat)) throw new Refused("chat must be a chat's id, from chat_search");
  return `/chats/${encodeURIComponent(chat)}`;
}

const CHAT_ARG = { chat: { type: "string", description: "A chat's id (from chat_search), to link to that chat." } };

export const TOOLS: Record<string, Tool> = {
  visual_guide: {
    description: "Learn how to create tappable images, diagrams and discussion cards in LobsterAttack replies. Both BusterClaw and Tiny Axe can use these formats directly.",
    inputSchema: { type: "object", properties: {}, required: [] },
    annotations: READ,
    async run() { return text(VISUAL_GUIDE); },
  },
  visual_create: {
    description: "Create a diagram or discussion card for a LobsterAttack reply. Validates a self-contained SVG drawing or a card, then returns a fenced block to include in your answer. Does not publish or send a message. Read visual_guide for examples.",
    inputSchema: { type: "object", properties: {
      svg: { type: "string", description: "One complete SVG with viewBox and title; at most 16,000 characters. Supply either svg or card." },
      card: { type: "object", properties: {
        title: { type: "string" }, body: { type: "string" }, bullets: { type: "array", items: { type: "string" } },
        kind: { type: "string", enum: ["idea", "comparison", "plan", "decision", "question"] },
      }, required: ["title"] },
    }, required: [] },
    annotations: READ,
    async run({ svg, card }) {
      if (typeof svg === "string" && card === undefined) {
        if (!drawing(svg)) throw new Refused("Invalid SVG. Use a complete self-contained drawing with a viewBox or numeric width/height, no active/external content, and fewer than 16,000 characters.");
        return text("Include this image block in your reply:\n\n```svg\n" + svg.trim() + "\n```");
      }
      const value = svg === undefined ? discussionCard(card) : null;
      if (!value) throw new Refused("Supply either svg or a card with a title and body/bullets. Read visual_guide for limits and examples.");
      return text("Include this discussion card in your reply:\n\n```card\n" + JSON.stringify(value) + "\n```");
    },
  },
  chat_search: {
    description:
      "Search the user's past chats with tiny-axe, for questions like \"what did we decide (or do) about X?\". " +
      `Finds the chats that have every word of \`q\` somewhere in them, newest first, at most ${MAX_SEARCH_RESULTS}, ` +
      "each with its id, title, when it started and was last updated, and a snippet. Read one with chat_read.",
    inputSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
    annotations: READ,
    async run({ q }, { owner, deps }) {
      if (typeof q !== "string" || q.trim() === "") throw new Refused("q must be some words to look for");
      return json({ results: chatSearch(await loadChats(deps.store(), owner), q) });
    },
  },

  chat_read: {
    description:
      "Read one of the user's past chats with tiny-axe by its id (from chat_search): its title and dates, then " +
      `each message as "user:" or "tiny-axe:". Long chats are cut at about ${MAX_READ_CHARS} characters.`,
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    annotations: READ,
    async run({ id }, { owner, deps }) {
      const chat = typeof id === "string" ? await loadChat(deps.store(), owner, id) : null;
      if (!chat) throw new Refused(`there's no chat ${JSON.stringify(id)}; find ids with chat_search`);
      return text(chatText(chat));
    },
  },

  site_link: {
    description:
      "Get a link to the user's chat history on tiny-axe's website to give the user: every chat, or one chat " +
      "with `chat` (its id). The user signs in to see it. Never open it yourself.",
    inputSchema: { type: "object", properties: CHAT_ARG, required: [] },
    annotations: READ,
    async run({ chat }, { origin }) {
      return text(`${origin}${sitePath(chat)}`);
    },
  },

  signin_link: {
    description:
      "For tiny-axe: a link that opens the user's chat history signed in, once (every chat, or one chat with " +
      "`chat`, its id). The one-time token is in the link's #fragment, so it never reaches a server log.",
    inputSchema: { type: "object", properties: CHAT_ARG, required: [] },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    async run({ chat }, { owner, deps, origin }) {
      if (!deps.accounts) throw new Refused("this site can't make sign-in links");
      const path = sitePath(chat);
      const token = await deps.accounts().signinToken(owner);
      return text(`${origin}${path}#signin=${encodeURIComponent(token)}`);
    },
  },

  chat_push: {
    description:
      "For tiny-axe's chat history: store one chat, as its history file holds it (version 1). Replaces the stored " +
      "copy if it changed; `context` is never kept.",
    inputSchema: { type: "object", properties: { chat: { type: "object" } }, required: ["chat"] },
    annotations: PUSH,
    async run({ chat }, { owner, deps }) {
      return json(await pushChat(deps.store(), owner, chat));
    },
  },
};
