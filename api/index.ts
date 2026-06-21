import { handle } from "hono/vercel";
import app from "./_app.js";

// Vercel serverless entry. The vercel.json rewrite sends /api/(.*) here, and the
// Hono app (basePath "/api") matches the preserved URL. Bun-style local serving
// lives in _server.ts.
export const config = { runtime: "nodejs" };

export default handle(app);
