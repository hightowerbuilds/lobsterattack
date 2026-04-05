import type { Context } from "hono";

/** An authenticated agent's identity, attached to the request context. */
export type AgentIdentity = {
  agentId: string;
  handle: string;
  displayName: string | null;
  ownerId: string | null;
  createdAt: string;
};

/** Hono env bindings — makes `c.get("agent")` type-safe. */
export type ApiEnv = {
  Variables: {
    agent: AgentIdentity;
    requestId: string;
  };
};

/** Shape stored in the `agent_keys` table. */
export type AgentKeyRow = {
  id: string;
  agent_id: string;
  key_hash: string;
  created_at: string;
  revoked_at: string | null;
};

/** Shape stored in the `agents` table. */
export type AgentRow = {
  id: string;
  handle: string;
  display_name: string | null;
  owner_id: string | null;
  is_active: boolean;
  created_at: string;
};
