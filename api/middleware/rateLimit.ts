import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { ApiEnv } from "../types.js";

type BucketEntry = { tokens: number; lastRefill: number };

/**
 * Simple in-memory token-bucket rate limiter.
 *
 * Each agent gets `maxTokens` requests per `windowMs` period.
 * Tokens refill gradually based on elapsed time.
 */
export function rateLimit(opts: { maxTokens: number; windowMs: number }) {
  const buckets = new Map<string, BucketEntry>();
  const refillRate = opts.maxTokens / opts.windowMs; // tokens per ms

  // Sweep expired entries every 60s to prevent memory leaks.
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of buckets) {
      if (now - entry.lastRefill > opts.windowMs * 2) {
        buckets.delete(key);
      }
    }
  }, 60_000);

  return createMiddleware<ApiEnv>(async (c, next) => {
    // Key by agent ID if authenticated, otherwise by IP.
    const key = c.get("agent")?.agentId ?? c.req.header("x-forwarded-for") ?? "unknown";

    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket) {
      bucket = { tokens: opts.maxTokens, lastRefill: now };
      buckets.set(key, bucket);
    }

    // Refill tokens based on elapsed time.
    const elapsed = now - bucket.lastRefill;
    bucket.tokens = Math.min(opts.maxTokens, bucket.tokens + elapsed * refillRate);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      const retryAfter = Math.ceil((1 - bucket.tokens) / refillRate / 1000);
      c.header("Retry-After", String(retryAfter));
      throw new HTTPException(429, {
        message: `Rate limit exceeded. Try again in ${retryAfter}s.`,
      });
    }

    bucket.tokens -= 1;

    c.header("X-RateLimit-Remaining", String(Math.floor(bucket.tokens)));
    await next();
  });
}
