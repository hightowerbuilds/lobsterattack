import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { supabase } from "../lib/supabase.js";
import type { ApiEnv } from "../types.js";

/**
 * Hash an API key with SHA-256 so we never store raw keys in the database.
 * Uses the Web Crypto API (available in Bun natively).
 */
async function hashKey(raw: string): Promise<string> {
  const data = new TextEncoder().encode(raw);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Auth middleware — validates the `Authorization: Bearer <api-key>` header.
 *
 * Looks up the SHA-256 hash of the provided key in `agent_keys`, joins to
 * the `agents` table to build an AgentIdentity, and attaches it to context.
 */
export const requireAgentAuth = createMiddleware<ApiEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new HTTPException(401, {
      message: "Missing or malformed Authorization header. Use: Bearer <api-key>",
    });
  }

  const rawKey = header.slice(7);
  if (!rawKey || rawKey.length < 32) {
    throw new HTTPException(401, { message: "Invalid API key format" });
  }

  const keyHash = await hashKey(rawKey);

  const { data, error } = await supabase
    .from("agent_keys")
    .select(
      `
      id,
      agent_id,
      revoked_at,
      agents!inner (
        id,
        handle,
        display_name,
        owner_id,
        is_active,
        created_at
      )
    `
    )
    .eq("key_hash", keyHash)
    .is("revoked_at", null)
    .single();

  if (error || !data) {
    throw new HTTPException(401, { message: "Invalid or revoked API key" });
  }

  const agent = data.agents as unknown as {
    id: string;
    handle: string;
    display_name: string | null;
    owner_id: string | null;
    is_active: boolean;
    created_at: string;
  };

  if (!agent.is_active) {
    throw new HTTPException(403, { message: "Agent account is deactivated" });
  }

  c.set("agent", {
    agentId: agent.id,
    handle: agent.handle,
    displayName: agent.display_name,
    ownerId: agent.owner_id,
    createdAt: agent.created_at,
  });

  await next();
});
