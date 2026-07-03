import { config, convertCurrency, COUNTRY_CURRENCY } from "../config.js";
import { pool } from "../lib/db.js";
import { cacheGet, cacheSet } from "../lib/redis.js";
import { runAdapter, type StoreAdapter } from "../adapters/storeAdapter.js";
import { amazonSaAdapter } from "../adapters/amazonSaAdapter.js";
import { noonAdapter } from "../adapters/noonAdapter.js";
import { getActiveCouponsByStore } from "./couponService.js";
import { getShippingRates, resolveShipping } from "./shippingService.js";
import type { SearchResponseDto, StoreOfferDto } from "../types.js";

/** Registered store integrations. Add an adapter here to add a store. */
const ADAPTERS: StoreAdapter[] = [amazonSaAdapter, noonAdapter];

/**
 * The search pipeline:
 *
 *   1. Redis cache lookup (TTL 3h) — identical queries never re-hit stores.
 *   2. Cache miss: fan out to all store adapters in parallel; each has its
 *      own timeout and failures degrade to partial results.
 *   3. Enrich every listing with shipping to the shopper's country and the
 *      store's active coupons (single batched DB query each).
 *   4. Convert to the shopper's currency, compute total = item + shipping,
 *      sort ascending by total.
 *   5. Store in Redis and return.
 */
export async function searchProducts(
  query: string,
  country: string
): Promise<SearchResponseDto> {
  const normalizedQuery = normalizeQuery(query);
  const targetCurrency = COUNTRY_CURRENCY[country] ?? "SAR";
  const cacheKey = `search:v1:${country}:${normalizedQuery}`;

  // 1. cache
  const cached = await cacheGet(cacheKey);
  if (cached) {
    const dto = JSON.parse(cached) as SearchResponseDto;
    dto.cached = true;
    return dto;
  }

  // 2. fan out to stores
  const settled = await Promise.all(
    ADAPTERS.map((a) => runAdapter(a, normalizedQuery, config.adapterTimeoutMs))
  );
  const listings = settled.flatMap((r) => r.listings);
  const failedStores = ADAPTERS.filter((_, i) => settled[i]!.failed).map(
    (a) => a.storeSlug
  );

  // 3. batched enrichment
  const storeSlugs = [...new Set(listings.map((l) => l.storeSlug))];
  const [storeMeta, couponsByStore, shippingByStore] = await Promise.all([
    getStoreMeta(storeSlugs),
    getActiveCouponsByStore(storeSlugs),
    getShippingRates(storeSlugs, country),
  ]);

  // 4. build offers in shopper currency
  const results: StoreOfferDto[] = listings
    .filter((l) => storeMeta.has(l.storeSlug)) // unknown store = misconfigured adapter
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

  const response: SearchResponseDto = {
    query: normalizedQuery,
    country,
    currency: targetCurrency,
    results,
    failed_stores: failedStores,
    cached: false,
    fetched_at: new Date().toISOString(),
  };

  // 5. cache — only when at least one store answered, so an outage
  //    doesn't pin an empty result for 3 hours.
  if (results.length > 0) {
    await cacheSet(cacheKey, JSON.stringify(response), config.searchCacheTtlSeconds);
  }
  return response;
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
