import { Redis } from "ioredis";
import { config } from "../config.js";

/**
 * Redis is a soft dependency: if it is down, search still works — every
 * request just goes to the adapters. cacheGet/cacheSet never throw.
 */
const redis = new Redis(config.redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy: (times) => Math.min(times * 500, 5_000),
});

let available = false;

redis.on("ready", () => {
  available = true;
  console.log("[redis] connected");
});
redis.on("error", (err) => {
  if (available) console.warn("[redis] connection lost:", err.message);
  available = false;
});

export async function initRedis(): Promise<void> {
  try {
    await redis.connect();
  } catch (err) {
    console.warn(
      "[redis] unavailable, caching disabled:",
      (err as Error).message
    );
  }
}

export async function cacheGet(key: string): Promise<string | null> {
  if (!available) return null;
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: string,
  ttlSeconds: number
): Promise<void> {
  if (!available) return;
  try {
    await redis.setex(key, ttlSeconds, value);
  } catch {
    /* cache write failures are non-fatal */
  }
}

export async function closeRedis(): Promise<void> {
  try {
    await redis.quit();
  } catch {
    redis.disconnect();
  }
}
