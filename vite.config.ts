import solid from "vite-plugin-solid";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [solid()],
  // The API runs beside the page in development (bun run api:dev; API_PORT
  // moves both when 3001 is taken). Not /api/_lib/: that's code the page
  // shares with the API (accounts.ts, chats/render.ts), which Vite serves.
  server: { proxy: { "^/api/(?!_lib/)": `http://localhost:${process.env.API_PORT ?? "3001"}` } },
});
