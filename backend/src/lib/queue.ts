import { Queue, QueueEvents } from "bullmq";
import { Redis } from "ioredis";
import { config } from "../config.js";

/**
 * BullMQ plumbing shared by the API (producer) and the worker (consumer).
 *
 * BullMQ needs its own Redis connections (maxRetriesPerRequest must be null)
 * — do not reuse the cache client from lib/redis.ts.
 */

export const SCRAPE_QUEUE = "scrape";
export const PRICE_CHECK_QUEUE = "price-check";

export interface ScrapeJobData {
  storeSlug: string;
  query: string;
}

export interface PriceCheckJobData {
  /** Empty = re-check every tracked listing (the scheduled sweep). */
  listingIds?: string[];
}

export function createQueueConnection(): Redis {
  return new Redis(config.redisUrl, { maxRetriesPerRequest: null });
}

let scrapeQueue: Queue<ScrapeJobData> | null = null;
let scrapeQueueEvents: QueueEvents | null = null;
let priceCheckQueue: Queue<PriceCheckJobData> | null = null;

export function getScrapeQueue(): Queue<ScrapeJobData> {
  scrapeQueue ??= new Queue<ScrapeJobData>(SCRAPE_QUEUE, {
    connection: createQueueConnection(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 3_000 },
      removeOnComplete: { age: 3600, count: 500 },
      removeOnFail: { age: 24 * 3600 },
    },
  });
  return scrapeQueue;
}

export function getScrapeQueueEvents(): QueueEvents {
  scrapeQueueEvents ??= new QueueEvents(SCRAPE_QUEUE, {
    connection: createQueueConnection(),
  });
  return scrapeQueueEvents;
}

export function getPriceCheckQueue(): Queue<PriceCheckJobData> {
  priceCheckQueue ??= new Queue<PriceCheckJobData>(PRICE_CHECK_QUEUE, {
    connection: createQueueConnection(),
    defaultJobOptions: {
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 24 * 3600 },
    },
  });
  return priceCheckQueue;
}

/**
 * Enqueue one store scrape, deduplicated: while a scrape for the same
 * store+query is queued or running, re-enqueueing returns the existing job.
 */
export async function enqueueScrape(storeSlug: string, query: string) {
  const jobId = `scrape:${storeSlug}:${query}`.replace(/\s+/g, "_");
  return getScrapeQueue().add(
    "scrape",
    { storeSlug, query },
    { jobId }
  );
}

export async function closeQueues(): Promise<void> {
  await Promise.allSettled([
    scrapeQueue?.close(),
    scrapeQueueEvents?.close(),
    priceCheckQueue?.close(),
  ]);
}
