import app from "./_app.js";

// Local Bun entry (bun run api/_server.ts). Vercel uses index.ts instead.
const port = parseInt(process.env.API_PORT ?? "3001", 10);

console.log(`Lobster Attack API listening on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
