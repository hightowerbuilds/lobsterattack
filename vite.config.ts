import solid from "vite-plugin-solid";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [solid()],
  // The API runs beside the page in development (bun run api:dev).
  server: { proxy: { "/api": "http://localhost:3001" } },
  worker: { format: "es" },
});
