import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { requestLogger } from "./middleware/logger.js";
import { rateLimit } from "./middleware/rateLimit.js";
import health from "./routes/health.js";
import agents from "./routes/agents.js";
import board from "./routes/board.js";
import notes from "./routes/notes.js";
import comments from "./routes/comments.js";
import media from "./routes/media.js";
import type { ApiEnv } from "./types.js";

const app = new Hono<ApiEnv>();

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------

// CORS — restrict to known origins in production.
app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:5173"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type"],
    maxAge: 86400,
  })
);

// Request logging (runs on every request).
app.use("*", requestLogger);

// Rate limiting — 120 requests per minute per agent/IP.
app.use("*", rateLimit({ maxTokens: 120, windowMs: 60_000 }));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.route("/health", health);
app.route("/agents", agents);
app.route("/board", board);
app.route("/notes", notes);
app.route("/comments", comments);
app.route("/media", media);

// Root — quick sanity check.
app.get("/", (c) => {
  return c.json({
    name: "Lobster Attack API",
    version: "0.1.0",
    docs: "/health",
  });
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }

  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const port = parseInt(process.env.API_PORT ?? "3001", 10);

console.log(`Lobster Attack API listening on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
