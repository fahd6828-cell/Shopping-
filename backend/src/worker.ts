import { Worker } from "bullmq";
import { config } from "./config.js";
import { pool } from "./lib/db.js";
import {
  PRICE_CHECK_QUEUE,
  SCRAPE_QUEUE,
  createQueueConnection,
  getPriceCheckQueue,
  type PriceCheckJobData,
  type ScrapeJobData,
} from "./lib/queue.js";
import { runAdapter } from "./adapters/storeAdapter.js";
import { getAdapter } from "./adapters/index.js";
import { persistListings } from "./services/catalogService.js";
import { runPriceCheckSweep } from "./services/alertService.js";

/**
 * Souqly worker — the only process that talks to external stores.
 *
 * Run separately from the API:  npm run worker
 *
 * Design:
 *  - one BullMQ worker consumes the `scrape` queue; concurrency and the
 *    rate limiter are deliberately conservative (stores block aggressive
 *    clients, and the 3h Redis cache upstream keeps demand low);
 *  - job = (storeSlug, query): run that store's adapter, persist results
 *    into products/product_listings/price_history via catalogService;
 *  - a failed job throws so BullMQ retries with backoff, and the API's
 *    `refreshing` flag tells clients data is still on its way.
 */

const scrapeWorker = new Worker<ScrapeJobData>(
  SCRAPE_QUEUE,
  async (job) => {
    const { storeSlug, query } = job.data;
    const adapter = getAdapter(storeSlug);
    if (!adapter) throw new Error(`no adapter registered for '${storeSlug}'`);

    const { listings, failed } = await runAdapter(
      adapter,
      query,
      config.adapterTimeoutMs
    );
    if (failed) throw new Error(`adapter '${storeSlug}' failed for "${query}"`);

    const persisted = await persistListings(listings);
    return { listings: listings.length, persisted: persisted.length };
  },
  {
    connection: createQueueConnection(),
    concurrency: 2, // across stores; per-store politeness via limiter below
    limiter: { max: 10, duration: 60_000 },
  }
);

scrapeWorker.on("completed", (job, result) => {
  console.log(
    `[worker] scrape ${job.data.storeSlug}/"${job.data.query}" done:`,
    result
  );
});
scrapeWorker.on("failed", (job, err) => {
  console.warn(
    `[worker] scrape ${job?.data.storeSlug}/"${job?.data.query}" failed:`,
    err.message
  );
});

/* ------------------------------------------------------------------ */
/* price-check: hourly sweep of tracked listings → refresh + alerts    */
/* ------------------------------------------------------------------ */

const priceCheckWorker = new Worker<PriceCheckJobData>(
  PRICE_CHECK_QUEUE,
  async () => runPriceCheckSweep(),
  { connection: createQueueConnection(), concurrency: 1 }
);

priceCheckWorker.on("completed", (_job, result) => {
  console.log("[worker] price-check sweep done:", result);
});
priceCheckWorker.on("failed", (_job, err) => {
  console.warn("[worker] price-check sweep failed:", err.message);
});

/** Register (idempotently) the hourly schedule on startup. */
async function scheduleHourlyPriceCheck(): Promise<void> {
  await getPriceCheckQueue().upsertJobScheduler(
    "hourly-price-check",
    { pattern: "0 * * * *" }, // top of every hour
    { name: "sweep", data: {} }
  );
}

scheduleHourlyPriceCheck().catch((err) =>
  console.error("[worker] failed to register price-check schedule:", err)
);

console.log(
  `[worker] consuming '${SCRAPE_QUEUE}' + '${PRICE_CHECK_QUEUE}' ` +
    `(mode=${config.queueMode}, scraper=${config.scraperEnabled ? "real" : "mock"})`
);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    await Promise.allSettled([scrapeWorker.close(), priceCheckWorker.close()]);
    await pool.end();
    process.exit(0);
  });
}
