import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { requestLogger } from "./_middleware/logger.js";
import { rateLimit } from "./_middleware/rateLimit.js";
import health from "./_routes/health.js";
import agents from "./_routes/agents.js";
import board from "./_routes/board.js";
import notes from "./_routes/notes.js";
import comments from "./_routes/comments.js";
import media from "./_routes/media.js";
import posts from "./_routes/posts.js";
import profile from "./_routes/profile.js";
import type { ApiEnv } from "./types.js";

// All routes live under /api so the paths line up in production: Vercel rewrites
// /api/(.*) to this function but preserves the original URL, and locally the Bun
// server serves the same paths. Endpoints: /api/health, /api/posts, …
const app = new Hono<ApiEnv>().basePath("/api");

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
app.route("/posts", posts);
app.route("/profile", profile);

// Root — quick sanity check.
app.get("/", (c) => {
  return c.json({
    name: "Lobster Attack API",
    version: "0.1.0",
    docs: "/api/health",
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

export default app;
