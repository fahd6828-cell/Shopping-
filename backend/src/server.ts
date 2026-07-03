import express from "express";
import { config } from "./config.js";
import { initRedis, closeRedis } from "./lib/redis.js";
import { closeQueues } from "./lib/queue.js";
import { pool } from "./lib/db.js";
import { searchRouter } from "./routes/search.js";
import { trackingRouter } from "./routes/tracking.js";
import { listingsRouter } from "./routes/listings.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json());

// CORS: the browser extension popup and (in dev) the RN Metro bundler call
// this API from other origins. PRODUCTION: restrict to the extension ID
// origin (chrome-extension://...) and the app's domains.
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api", searchRouter);
app.use("/api", trackingRouter);
app.use("/api", listingsRouter);

// Central error handler — uncaught route errors become clean 500s.
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("[api] unhandled error:", err);
    res.status(500).json({ error: "internal_error" });
  }
);

const server = app.listen(config.port, async () => {
  await initRedis();
  console.log(`[api] Souqly backend listening on :${config.port}`);
});

// Graceful shutdown so in-flight requests finish and pools close cleanly.
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    server.close(async () => {
      await Promise.allSettled([pool.end(), closeRedis(), closeQueues()]);
      process.exit(0);
    });
  });
}

export { app };
