import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requestLogger } from "./_middleware/logger.js";
import { rateLimit } from "./_middleware/rateLimit.js";
import health from "./_routes/health.js";
import { tinyAxeApi } from "./_routes/tinyaxe.js";
import { supabase } from "./_lib/supabase.js";
import { supabaseStore, type Store } from "./_lib/store.js";
import type { ApiEnv } from "./types.js";

// All routes live under /api so the paths line up in production: Vercel rewrites
// /api/(.*) to this function but preserves the original URL, and locally the Bun
// server serves the same paths. The site's pages are on the same origin, so
// there's no CORS: other sites' pages can't read the API.
const app = new Hono<ApiEnv>().basePath("/api");

app.use("*", requestLogger);

// 120 requests per minute per IP. In memory, so per function instance: a
// speed bump for now, not a guarantee.
app.use("*", rateLimit({ maxTokens: 120, windowMs: 60_000 }));

app.route("/health", health);

// tiny-axe's home: /api/mcp for tiny-axe, and what the site's pages read.
let store: Store | undefined;
app.route(
  "/",
  tinyAxeApi({
    store: () => (store ??= supabaseStore(supabase)),
    async verifyViewer(token) {
      const { data, error } = await supabase.auth.getUser(token);
      return error ? null : (data.user?.id ?? null);
    },
  })
);

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }

  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
