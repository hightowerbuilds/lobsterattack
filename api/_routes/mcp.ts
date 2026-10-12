import { Hono } from "hono";
import { addNote, loadVault, MAX_BODY, MAX_NOTES_PER_PUSH, MAX_TITLE, pushChat, pushNotes, Refused } from "../_lib/tinyaxe.js";
import { overview, search } from "../_lib/vault/views.js";
import type { Deps } from "./tinyaxe.js";

// /api/mcp: the site as an MCP server, for tiny-axe (MCP streamable HTTP,
// answered with plain JSON; no sessions and no event stream, so it suits
// Vercel's short-lived functions). The key was checked before this runs, and
// says whose site it is.
//
// The read tools are for the model. vault_push, chat_push and signin_link are
// for tiny-axe's own code (its vault writer, chat history, and opening the
// site signed in); tiny-axe's gate keeps them from agents.

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

const TOOLS: Record<string, Tool> = {
  graph_overview: {
    description:
      "What tiny-axe knows how to do on the web, in numbers: how many sites, pages, controls, paths (and how many " +
      "were blocked), tools and tasks are in its know-how graph.",
    inputSchema: { type: "object", properties: {}, required: [] },
    annotations: READ,
    async run(_args, { owner, deps }) {
      const { schema, summary } = overview(await loadVault(deps.store(), owner));
      return json({ schema, summary });
    },
  },

  graph_search: {
    description:
      "Search tiny-axe's know-how graph (sites, pages, controls, the paths it took and the tasks it did) for notes " +
      "that contain every word of `q`. Gives up to 50 notes, each with its id, kind, title and a snippet.",
    inputSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
    annotations: READ,
    async run({ q }, { owner, deps }) {
      if (typeof q !== "string" || q.trim() === "") throw new Refused("q must be some words to look for");
      const results = search(await loadVault(deps.store(), owner), q).map(({ id, kind, title, snippet }) => ({
        id,
        kind,
        title,
        snippet,
      }));
      return json({ results });
    },
  },

  graph_note: {
    description:
      "Read one note of tiny-axe's know-how graph by its id (from graph_search): its Markdown, with [[links]] to " +
      "other notes by id, and the notes that link to it.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    annotations: READ,
    async run({ id }, { owner, deps }) {
      const vault = await loadVault(deps.store(), owner);
      const note = typeof id === "string" ? vault.notes.get(id) : undefined;
      if (!note) throw new Refused(`there's no note ${JSON.stringify(id)}; find ids with graph_search`);
      const from = vault.backlinks.get(note.id) ?? [];
      return text(
        `id: ${note.id}\nkind: ${note.kind}\n\n${note.body}` +
          (from.length > 0 ? `\nLinked from: ${from.map((f) => `[[${f}]]`).join(", ")}\n` : ""),
      );
    },
  },

  graph_link: {
    description:
      "Get a link to tiny-axe's website to give the user: the know-how graph, one note (`focus`, a note id), or " +
      "with `page: \"chats\"` the history of every chat. The user signs in to see it. Never open it yourself.",
    inputSchema: {
      type: "object",
      properties: { focus: { type: "string" }, page: { type: "string", enum: ["graph", "chats"] } },
      required: [],
    },
    annotations: READ,
    async run({ focus, page }, { origin }) {
      if (page === "chats") return text(`${origin}/chats`);
      if (typeof focus === "string" && focus !== "") return text(`${origin}/note/${encodeURIComponent(focus)}`);
      return text(`${origin}/`);
    },
  },

  graph_add_note: {
    description:
      "Save a note to the user's page of tiny-axe's website, in its Notes, when the user asks you to remember " +
      "or write down something worth keeping (how something is done, a finding, a summary). `title` names it " +
      `(at most ${MAX_TITLE} characters; the same title replaces your earlier note of that name). \`body\` is ` +
      "Markdown; link other notes with [[id]] (ids from graph_search). The user is asked before it's saved.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: MAX_TITLE },
        body: { type: "string", maxLength: MAX_BODY },
      },
      required: ["title", "body"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async run({ title, body }, { owner, deps, origin }) {
      const note = await addNote(deps.store(), owner, { title, body });
      return json({ ...note, link: `${origin}/note/${encodeURIComponent(note.id)}` });
    },
  },

  signin_link: {
    description:
      "For tiny-axe: a link that opens the user's page signed in, once (the graph, one note with `focus`, or " +
      "`page: \"chats\"`). The one-time token is in the link's #fragment, so it never reaches a server log.",
    inputSchema: {
      type: "object",
      properties: { focus: { type: "string" }, page: { type: "string", enum: ["graph", "chats"] } },
      required: [],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    async run({ focus, page }, { owner, deps, origin }) {
      if (!deps.accounts) throw new Refused("this site can't make sign-in links");
      const token = await deps.accounts().signinToken(owner);
      const path =
        page === "chats" ? "/chats" : typeof focus === "string" && focus !== "" ? `/note/${encodeURIComponent(focus)}` : "/";
      return text(`${origin}${path}#signin=${encodeURIComponent(token)}`);
    },
  },

  vault_push: {
    description:
      `For tiny-axe's vault writer: store notes of the know-how vault (at most ${MAX_NOTES_PER_PUSH} per call), ` +
      "each {folder, id, text} as the vault holds it, with the vault's manifest. Notes whose text is unchanged are " +
      "skipped; nothing is ever deleted.",
    inputSchema: {
      type: "object",
      properties: {
        manifest: { type: "object" },
        notes: {
          type: "array",
          maxItems: MAX_NOTES_PER_PUSH,
          items: {
            type: "object",
            properties: { folder: { type: "string" }, id: { type: "string" }, text: { type: "string" } },
            required: ["folder", "id", "text"],
          },
        },
      },
      required: ["manifest", "notes"],
    },
    annotations: PUSH,
    async run({ manifest, notes }, { owner, deps }) {
      return json(await pushNotes(deps.store(), owner, manifest, notes));
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
          "tiny-axe's website: its know-how graph and its chat history, shown to the people its owner lets in.",
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
