import { Worker } from "bullmq";
import { config } from "./config.js";
import { pool } from "./lib/db.js";
import {
  SCRAPE_QUEUE,
  createQueueConnection,
  type ScrapeJobData,
} from "./lib/queue.js";
import { runAdapter } from "./adapters/storeAdapter.js";
import { getAdapter } from "./adapters/index.js";
import { persistListings } from "./services/catalogService.js";

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

console.log(
  `[worker] consuming '${SCRAPE_QUEUE}' (mode=${config.queueMode}, scraper=${config.scraperEnabled ? "real" : "mock"})`
);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    await scrapeWorker.close();
    await pool.end();
    process.exit(0);
  });
}
