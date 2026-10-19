import { Hono } from "hono";
import { TOOLS, text, type Ctx } from "../_lib/mcp-tools.js";
import { Refused } from "../_lib/tinyaxe.js";
import type { Deps } from "./tinyaxe.js";

// MCP streamable HTTP with plain JSON: no sessions or persistent event stream.
const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const VERSION = "0.1.0";
type Env = { Variables: { owner: string } };
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

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

async function handle(raw: unknown, ctx: Ctx): Promise<object | null> {
  const message = record(raw);
  if (!message || message.jsonrpc !== "2.0") return failure(message?.id ?? null, -32600, "Invalid Request");
  const { id, method } = message;
  const params = record(message.params) ?? {};
  // A notification, or a response to something we never asked.
  if (id === undefined || id === null || typeof method !== "string") return null;

  switch (method) {
    case "initialize": {
      const asked = params?.protocolVersion;
      return success(id, {
        protocolVersion: typeof asked === "string" && PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
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
      const tool = typeof params.name === "string" && Object.hasOwn(TOOLS, params.name) ? TOOLS[params.name] : undefined;
      if (!tool) return failure(id, -32602, `Unknown tool: ${params?.name}`);
      const args = record(params.arguments) ?? {};
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
