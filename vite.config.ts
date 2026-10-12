import solid from "vite-plugin-solid";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [solid()],
  // The API runs beside the page in development (bun run api:dev; API_PORT
  // moves both when 3001 is taken).
  server: { proxy: { "/api": `http://localhost:${process.env.API_PORT ?? "3001"}` } },
  worker: { format: "es" },
});
