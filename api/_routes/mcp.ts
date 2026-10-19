import { Hono } from "hono";
import { discussionCard, drawing, VISUAL_GUIDE } from "../_lib/chats/visuals.js";
import { CHAT_ID } from "../_lib/chats/history.js";
import { chatSearch, chatText, MAX_READ_CHARS, MAX_SEARCH_RESULTS } from "../_lib/chats/views.js";
import { loadChat, loadChats, pushChat, Refused } from "../_lib/tinyaxe.js";
import type { Deps } from "./tinyaxe.js";

// /api/mcp: the site as an MCP server, for tiny-axe (MCP streamable HTTP,
// answered with plain JSON; no sessions and no event stream, so it suits
// Vercel's short-lived functions). The key was checked before this runs, and
// says whose site it is.
//
// The read tools are for the model. chat_push and signin_link are for
// tiny-axe's own code (its chat history, and opening the site signed in);
// tiny-axe's gate keeps them from agents.

const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const VERSION = "0.1.0";

type Env = { Variables: { owner: string } };
type Result = { content: { type: "text"; text: string }[]; isError?: boolean };
type Ctx = { owner: string; deps: Deps; origin: string };

interface Tool {
  description: string;
  inputSchema: object;
  annotations: object;
  run(args: Record<string, any>, ctx: Ctx): Promise<Result>;
}

const READ = { readOnlyHint: true, openWorldHint: false };
const PUSH = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const text = (t: string): Result => ({ content: [{ type: "text", text: t }] });
const json = (v: unknown): Result => text(JSON.stringify(v, null, 1));

// The site's page for the chat list, or for one chat.
function sitePath(chat: unknown): string {
  if (chat === undefined || chat === null || chat === "") return "/chats";
  if (typeof chat !== "string" || !CHAT_ID.test(chat)) throw new Refused("chat must be a chat's id, from chat_search");
  return `/chats/${encodeURIComponent(chat)}`;
}

const CHAT_ARG = { chat: { type: "string", description: "A chat's id (from chat_search), to link to that chat." } };

const TOOLS: Record<string, Tool> = {
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

export function mcp(deps: Deps) {
  const app = new Hono<Env>();

  // There's no stream to open and no session to end.
  app.get("/", (c) => c.body(null, 405, { Allow: "POST" }));
  app.delete("/", (c) => c.body(null, 405, { Allow: "POST" }));

  app.post("/", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(failure(null, -32700, "Parse error"), 400);
    }

    const ctx: Ctx = { owner: c.get("owner"), deps, origin: new URL(c.req.url).origin };
    const batch = Array.isArray(body);
    const messages: unknown[] = batch ? (body as unknown[]) : [body];
    const replies = (await Promise.all(messages.map((m) => handle(m, ctx)))).filter((r) => r !== null);

    // Only notifications (or responses): nothing to say back.
    if (replies.length === 0) return c.body(null, 202);
    return c.json(batch ? replies : replies[0]);
  });

  return app;
}

async function handle(message: any, ctx: Ctx): Promise<object | null> {
  if (typeof message !== "object" || message === null || message.jsonrpc !== "2.0") {
    return failure(message?.id ?? null, -32600, "Invalid Request");
  }
  const { id, method, params } = message;
  // A notification, or a response to something we never asked.
  if (id === undefined || id === null || typeof method !== "string") return null;

  switch (method) {
    case "initialize": {
      const asked = params?.protocolVersion;
      return success(id, {
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "tiny-axe-home", version: VERSION },
        instructions:
          "tiny-axe's website: the user's chat history with tiny-axe, searchable, shown to the people its owner " +
          "lets in. Search past chats with chat_search and read one with chat_read; give the user a link to them " +
          "with site_link. For tappable diagrams and discussion cards, read visual_guide and use visual_create to validate the block for your reply.",
      });
    }

    case "ping":
      return success(id, {});

    case "tools/list":
      return success(id, {
        tools: Object.entries(TOOLS).map(([name, t]) => ({
          name,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: t.annotations,
        })),
      });

    case "tools/call": {
      const tool = Object.hasOwn(TOOLS, params?.name) ? TOOLS[params.name] : undefined;
      if (!tool) return failure(id, -32602, `Unknown tool: ${params?.name}`);
      const args = typeof params.arguments === "object" && params.arguments !== null ? params.arguments : {};
      try {
        return success(id, await tool.run(args, ctx));
      } catch (error) {
        if (error instanceof Refused) return success(id, { ...text(error.message), isError: true });
        console.error(`mcp ${params.name}:`, error);
        return success(id, { ...text("The site couldn't do that just now; try again."), isError: true });
      }
    }

    default:
      return failure(id, -32601, `Method not found: ${method}`);
  }
}

const success = (id: unknown, result: object) => ({ jsonrpc: "2.0", id, result });
const failure = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
