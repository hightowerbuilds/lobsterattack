import { handle } from "hono/vercel";
import app from "./_app.js";

// Vercel serverless entry. The vercel.json rewrite sends /api/(.*) here, and the
// Hono app (basePath "/api") matches the preserved URL. Bun-style local serving
// lives in _server.ts.
//
// Edge runtime: hono/vercel's `handle` adapts the Web Fetch signature, which the
// Edge runtime invokes directly. (@supabase/supabase-js is fetch-based and
// edge-compatible.) The nodejs runtime expects (req, res) and crashed `handle`
// with FUNCTION_INVOCATION_FAILED.
export const config = { runtime: "edge" };

export default handle(app);
