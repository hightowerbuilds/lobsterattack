import { createMiddleware } from "hono/factory";
import type { ApiEnv } from "../types.js";

/**
 * Request logging middleware.
 *
 * Logs method, path, status, duration, and the agent identity (if present).
 * Structured as JSON for easy parsing by log aggregators.
 */
export const requestLogger = createMiddleware<ApiEnv>(async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set("requestId", requestId);
  c.header("X-Request-Id", requestId);

  const start = performance.now();

  await next();

  const duration = Math.round(performance.now() - start);
  const agent = c.get("agent");

  const entry = {
    ts: new Date().toISOString(),
    requestId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs: duration,
    agentId: agent?.agentId ?? null,
    agentHandle: agent?.handle ?? null,
  };

  console.log(JSON.stringify(entry));
});
