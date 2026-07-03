import "dotenv/config";

/**
 * Central, typed configuration. Everything comes from the environment with
 * sane development defaults matching docker-compose.yml.
 */
export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://souqly:souqly_dev@localhost:5432/souqly",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  /** Price search results are cached for 3 hours (spec) to limit scraping. */
  searchCacheTtlSeconds: Number(process.env.SEARCH_CACHE_TTL_SECONDS ?? 10_800),
  /** A slow/blocked store must not stall the whole comparison. */
  adapterTimeoutMs: Number(process.env.ADAPTER_TIMEOUT_MS ?? 8_000),
} as const;

/**
 * Static FX rates to normalize totals into the shopper's currency so offers
 * from SAR/AED/KWD stores sort fairly against each other.
 *
 * PRODUCTION NOTE: replace with a daily-refreshed FX feed (e.g. ECB or
 * exchangerate.host) stored in Redis; these pegs drift very little for
 * GCC currencies but EGP floats.
 */
export const FX_TO_USD: Record<string, number> = {
  USD: 1,
  SAR: 0.2666,
  AED: 0.2723,
  KWD: 3.2573,
  EGP: 0.0207,
};

/** Currency shown to users of each supported country. */
export const COUNTRY_CURRENCY: Record<string, string> = {
  SA: "SAR",
  AE: "AED",
  KW: "KWD",
  EG: "EGP",
};

export function convertCurrency(
  amount: number,
  from: string,
  to: string
): number {
  if (from === to) return amount;
  const fromUsd = FX_TO_USD[from];
  const toUsd = FX_TO_USD[to];
  if (!fromUsd || !toUsd) {
    throw new Error(`Unsupported currency conversion ${from} -> ${to}`);
  }
  return Math.round(((amount * fromUsd) / toUsd) * 100) / 100;
}
