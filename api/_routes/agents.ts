import { Hono } from "hono";
import { z } from "zod";
import { supabase } from "../_lib/supabase.js";
import { validateBody, getValidatedBody } from "../_middleware/validate.js";
import { requireAgentAuth } from "../_middleware/auth.js";
import type { ApiEnv } from "../types.js";

const agents = new Hono<ApiEnv>();

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const RegisterSchema = z.object({
  handle: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-z0-9_]+$/, "Handle must be lowercase alphanumeric or underscores"),
  displayName: z.string().min(1).max(64).optional(),
  ownerId: z.string().uuid().optional(),
});

type RegisterBody = z.infer<typeof RegisterSchema>;

// ---------------------------------------------------------------------------
// POST /agents/register  — public, creates agent + returns API key
// ---------------------------------------------------------------------------

agents.post("/register", validateBody(RegisterSchema), async (c) => {
  const body = getValidatedBody<RegisterBody>(c);

  // 1. Create the agent row.
  const { data: agent, error: agentErr } = await supabase
    .from("agents")
    .insert({
      handle: body.handle,
      display_name: body.displayName ?? null,
      owner_id: body.ownerId ?? null,
    })
    .select("id, handle, display_name, created_at")
    .single();

  if (agentErr) {
    if (agentErr.code === "23505") {
      return c.json({ error: "Handle is already taken" }, 409);
    }
    return c.json({ error: "Failed to create agent", detail: agentErr.message }, 500);
  }

  // 2. Generate an API key and store its hash.
  const rawKey = `la_${crypto.randomUUID().replace(/-/g, "")}`;
  const keyHash = await hashKey(rawKey);

  const { error: keyErr } = await supabase.from("agent_keys").insert({
    agent_id: agent.id,
    key_hash: keyHash,
  });

  if (keyErr) {
    // Roll back the agent row.
    await supabase.from("agents").delete().eq("id", agent.id);
    return c.json({ error: "Failed to generate API key", detail: keyErr.message }, 500);
  }

  // 3. Return the raw key — this is the only time it's ever shown.
  return c.json(
    {
      agent: {
        id: agent.id,
        handle: agent.handle,
        displayName: agent.display_name,
        createdAt: agent.created_at,
      },
      apiKey: rawKey,
      warning: "Store this key securely — it cannot be retrieved again.",
    },
    201
  );
});

// ---------------------------------------------------------------------------
// GET /agents/me  — authenticated, returns the calling agent's profile
// ---------------------------------------------------------------------------

agents.get("/me", requireAgentAuth, (c) => {
  const agent = c.get("agent");
  return c.json({ agent });
});

// ---------------------------------------------------------------------------
// Helper: hash a raw key with SHA-256 (same as auth middleware)
// ---------------------------------------------------------------------------

async function hashKey(raw: string): Promise<string> {
  const data = new TextEncoder().encode(raw);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default agents;
