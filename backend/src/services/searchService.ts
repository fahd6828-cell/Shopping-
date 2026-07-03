import { config, convertCurrency, COUNTRY_CURRENCY } from "../config.js";
import { pool } from "../lib/db.js";
import { cacheGet, cacheSet } from "../lib/redis.js";
import { enqueueScrape, getScrapeQueueEvents } from "../lib/queue.js";
import { runAdapter } from "../adapters/storeAdapter.js";
import { ADAPTERS } from "../adapters/index.js";
import {
  findListingsByQuery,
  persistListings,
  type DbListingRow,
} from "./catalogService.js";
import { getActiveCouponsByStore } from "./couponService.js";
import { getShippingRates, resolveShipping } from "./shippingService.js";
import type { RawListing, SearchResponseDto, StoreOfferDto } from "../types.js";

/**
 * The search pipeline:
 *
 *   1. Redis cache (TTL 3h) — identical queries never re-hit stores.
 *   2a. inline mode (dev): run adapters in-process, persist to the catalog,
 *       serve the adapter results directly.
 *   2b. queue mode (prod): serve from catalog listings; when they're stale
 *       or missing, enqueue scrape jobs for the worker and wait briefly —
 *       if jobs are still running at answer time, `refreshing: true` tells
 *       clients to re-query shortly.
 *   3. Enrich with shipping + coupons, convert currency, sort by total.
 *   4. Cache and return.
 */
export async function searchProducts(
  query: string,
  country: string
): Promise<SearchResponseDto> {
  const normalizedQuery = normalizeQuery(query);
  const targetCurrency = COUNTRY_CURRENCY[country] ?? "SAR";
  const cacheKey = `search:v2:${country}:${normalizedQuery}`;

  const cached = await cacheGet(cacheKey);
  if (cached) {
    const dto = JSON.parse(cached) as SearchResponseDto;
    dto.cached = true;
    return dto;
  }

  const gathered =
    config.queueMode === "queue"
      ? await gatherViaQueue(normalizedQuery)
      : await gatherInline(normalizedQuery);

  const results = await enrich(gathered.listings, country, targetCurrency);

  const response: SearchResponseDto = {
    query: normalizedQuery,
    country,
    currency: targetCurrency,
    results,
    failed_stores: gathered.failedStores,
    refreshing: gathered.refreshing,
    cached: false,
    fetched_at: new Date().toISOString(),
  };

  // Cache only complete, non-empty snapshots — a store outage or an
  // in-flight refresh must not pin bad data for 3 hours.
  if (results.length > 0 && !gathered.refreshing) {
    await cacheSet(cacheKey, JSON.stringify(response), config.searchCacheTtlSeconds);
  }
  return response;
}

interface Gathered {
  listings: EnrichableListing[];
  failedStores: string[];
  refreshing: boolean;
}

/** The common shape enrich() consumes, from adapters or from the DB. */
interface EnrichableListing extends RawListing {
  listingId: string | null;
}

/* ------------------------------------------------------------------ */
/* inline mode: adapters in-process (dev / tests)                      */
/* ------------------------------------------------------------------ */

async function gatherInline(query: string): Promise<Gathered> {
  const settled = await Promise.all(
    ADAPTERS.map((a) => runAdapter(a, query, config.adapterTimeoutMs))
  );
  const raw = settled.flatMap((r) => r.listings);
  const failedStores = ADAPTERS.filter((_, i) => settled[i]!.failed).map(
    (a) => a.storeSlug
  );

  // Feed the catalog even in dev so history/tracking features have data.
  let ids = new Map<string, string>();
  try {
    const persisted = await persistListings(raw);
    ids = new Map(persisted.map((p) => [`${p.storeSlug}:${p.url}`, p.listingId]));
  } catch (err) {
    console.warn("[search] catalog persist failed:", (err as Error).message);
  }

  return {
    listings: raw.map((l) => ({
      ...l,
      listingId: ids.get(`${l.storeSlug}:${l.url}`) ?? null,
    })),
    failedStores,
    refreshing: false,
  };
}

/* ------------------------------------------------------------------ */
/* queue mode: DB first, worker refreshes (production)                 */
/* ------------------------------------------------------------------ */

async function gatherViaQueue(query: string): Promise<Gathered> {
  let rows = await findListingsByQuery(query);

  const freshCutoff = Date.now() - config.listingFreshnessMs;
  const freshStores = new Set(
    rows
      .filter((r) => r.last_checked_at.getTime() >= freshCutoff)
      .map((r) => r.store_slug)
  );
  const staleAdapters = ADAPTERS.filter((a) => !freshStores.has(a.storeSlug));

  let refreshing = false;
  if (staleAdapters.length > 0) {
    const jobs = await Promise.all(
      staleAdapters.map((a) => enqueueScrape(a.storeSlug, query))
    );

    // Give the worker a short window; first-search UX beats a spinner-only
    // response, but we never block longer than scrapeWaitMs.
    const events = getScrapeQueueEvents();
    const outcomes = await Promise.allSettled(
      jobs.map((job) => job.waitUntilFinished(events, config.scrapeWaitMs))
    );
    refreshing = outcomes.some((o) => o.status === "rejected");

    rows = await findListingsByQuery(query);
  }

  return { listings: rows.map(dbRowToListing), failedStores: [], refreshing };
}

function dbRowToListing(row: DbListingRow): EnrichableListing {
  return {
    listingId: row.listing_id,
    storeSlug: row.store_slug,
    title: row.title,
    url: row.url,
    imageUrl: row.image_url,
    price: row.price,
    currency: row.currency,
    inStock: row.in_stock,
  };
}

/* ------------------------------------------------------------------ */
/* enrichment: shipping + coupons + FX + sort                          */
/* ------------------------------------------------------------------ */

async function enrich(
  listings: EnrichableListing[],
  country: string,
  targetCurrency: string
): Promise<StoreOfferDto[]> {
  const storeSlugs = [...new Set(listings.map((l) => l.storeSlug))];
  const [storeMeta, couponsByStore, shippingByStore] = await Promise.all([
    getStoreMeta(storeSlugs),
    getActiveCouponsByStore(storeSlugs),
    getShippingRates(storeSlugs, country),
  ]);

  return listings
    .filter((l) => storeMeta.has(l.storeSlug))
    .map((l) => {
      const meta = storeMeta.get(l.storeSlug)!;
      const price = convertCurrency(l.price, l.currency, targetCurrency);
      const shipping = resolveShipping(
        shippingByStore.get(l.storeSlug),
        l.price,
        l.currency,
        targetCurrency
      );
      return {
        store: meta,
        listing_id: l.listingId,
        product_title: l.title,
        product_url: l.url,
        image_url: l.imageUrl,
        in_stock: l.inStock,
        price,
        original_price: l.price,
        original_currency: l.currency,
        shipping,
        total_price: round2(price + (shipping?.cost ?? 0)),
        currency: targetCurrency,
        coupons: couponsByStore.get(l.storeSlug) ?? [],
      };
    })
    .sort((a, b) => a.total_price - b.total_price);
}

/** Lowercase, collapse whitespace — maximizes cache hit rate. */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

async function getStoreMeta(
  storeSlugs: string[]
): Promise<Map<string, StoreOfferDto["store"]>> {
  const byStore = new Map<string, StoreOfferDto["store"]>();
  if (storeSlugs.length === 0) return byStore;
  const { rows } = await pool.query<{
    slug: string;
    name: string;
    name_ar: string;
    logo_url: string | null;
  }>(
    `SELECT slug, name, name_ar, logo_url
       FROM stores
      WHERE slug = ANY($1) AND is_active`,
    [storeSlugs]
  );
  for (const row of rows) byStore.set(row.slug, row);
  return byStore;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
