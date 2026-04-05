import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { ZodType, ZodIssue } from "zod";

/**
 * Request body validation middleware using Zod.
 *
 * Parses `c.req.json()` against the provided schema.
 * On failure, returns a 422 with structured error details.
 * On success, the parsed (and potentially transformed) body is available
 * via `c.req.valid("json")` — but since Hono's built-in validator
 * isn't used here, we stash it on the request for downstream handlers.
 */
export function validateBody<T>(schema: ZodType<T>) {
  return createMiddleware(async (c, next) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw new HTTPException(400, { message: "Request body must be valid JSON" });
    }

    const result = schema.safeParse(raw);

    if (!result.success) {
      const issues = (result.error.issues as ZodIssue[]).map((i) => ({
        path: i.path.join("."),
        message: i.message,
      }));

      return c.json({ error: "Validation failed", details: issues }, 422);
    }

    // Stash the validated data so route handlers can retrieve it.
    c.set("validatedBody" as never, result.data as never);
    await next();
  });
}

/** Retrieve the validated body inside a route handler. */
export function getValidatedBody<T>(c: { get: (key: string) => unknown }): T {
  return c.get("validatedBody" as never) as T;
}
