import { Hono } from "hono";

const health = new Hono();

health.get("/", (c) => {
  return c.json({
    status: "ok",
    service: "lobster-attack-api",
    timestamp: new Date().toISOString(),
  });
});

export default health;
