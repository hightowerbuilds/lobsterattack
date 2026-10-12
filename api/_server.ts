import app from "./_app.js";

// Local Bun entry (bun run api/_server.ts). Vercel uses index.ts instead.
const port = parseInt(process.env.API_PORT ?? "3001", 10);

console.log(`tiny-axe home API on http://localhost:${port} (API_PORT changes it)`);

export default {
  port,
  fetch: app.fetch,
};
