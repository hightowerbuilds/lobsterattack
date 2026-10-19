import { createMiddleware } from "hono/factory";
import type { ApiEnv } from "../_types.js";

/**
 * Request logging middleware.
 *
 * Logs method, path, status and duration.
 * Structured as JSON for easy parsing by log aggregators.
 */
export const requestLogger = createMiddleware<ApiEnv>(async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set("requestId", requestId);
  c.header("X-Request-Id", requestId);

  const start = performance.now();

  await next();

  const duration = Math.round(performance.now() - start);

  const entry = {
    ts: new Date().toISOString(),
    requestId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs: duration,
  };

  console.log(JSON.stringify(entry));
});
