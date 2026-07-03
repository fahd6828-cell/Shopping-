import type { PoolClient } from "pg";
import { pool } from "../lib/db.js";
import type { RawListing } from "../types.js";

/**
 * The write path from adapters into the catalog tables. Every successful
 * store fetch flows through here so that:
 *   - `products` accumulates canonical items,
 *   - `product_listings` always reflects the latest store price,
 *   - `price_history` grows an honest, append-only price series
 *     (which powers price-drop alerts and the mobile sparkline).
 *
 * Product matching strategy (weakest-first fallbacks, documented limits):
 *   1. an existing listing with the same (store, sku) or (store, url)
 *      already knows its product;
 *   2. exact case-insensitive canonical_name match;
 *   3. otherwise a new product row is created.
 * PRODUCTION NOTE: cross-store entity resolution ("iPhone 16 128GB" on
 * Amazon == "Apple iPhone16 128 GB" on Noon) eventually needs barcode/model
 * matching plus fuzzy title scoring (pg_trgm); the seams for that live here.
 */

/** Skip a new history point when the price is unchanged and the last one is newer than this. */
const HISTORY_MIN_INTERVAL_HOURS = 6;

export interface PersistedListing {
  listingId: string;
  storeSlug: string;
  url: string;
}

/** Persist one adapter batch. Returns the affected listing ids. */
export async function persistListings(
  listings: RawListing[]
): Promise<PersistedListing[]> {
  if (listings.length === 0) return [];

  const client = await pool.connect();
  const persisted: PersistedListing[] = [];
  try {
    await client.query("BEGIN");
    for (const listing of listings) {
      const listingId = await upsertOne(client, listing);
      if (listingId) {
        persisted.push({ listingId, storeSlug: listing.storeSlug, url: listing.url });
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return persisted;
}

async function upsertOne(
  client: PoolClient,
  listing: RawListing
): Promise<string | null> {
  const storeRow = await client.query<{ id: number }>(
    `SELECT id FROM stores WHERE slug = $1 AND is_active`,
    [listing.storeSlug]
  );
  const storeId = storeRow.rows[0]?.id;
  if (!storeId) return null; // adapter for a store the DB doesn't know

  // 1. Existing listing for this store by SKU or URL?
  const existing = await client.query<{ id: string; product_id: string; current_price: number }>(
    `SELECT id, product_id, current_price
       FROM product_listings
      WHERE store_id = $1
        AND (($2::text IS NOT NULL AND store_sku = $2) OR store_product_url = $3)
      LIMIT 1`,
    [storeId, listing.sku ?? null, listing.url]
  );

  let productId: string;
  let listingId: string;

  if (existing.rows[0]) {
    productId = existing.rows[0].product_id;
    listingId = existing.rows[0].id;
    await client.query(
      `UPDATE product_listings
          SET current_price = $2,
              currency = $3,
              in_stock = $4,
              store_product_url = $5,
              store_sku = COALESCE($6, store_sku),
              last_checked_at = now()
        WHERE id = $1`,
      [listingId, listing.price, listing.currency, listing.inStock, listing.url, listing.sku ?? null]
    );
  } else {
    // 2. Match or create the canonical product.
    const productMatch = await client.query<{ id: string }>(
      `SELECT id FROM products WHERE lower(canonical_name) = lower($1) LIMIT 1`,
      [listing.title]
    );
    if (productMatch.rows[0]) {
      productId = productMatch.rows[0].id;
    } else {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO products (canonical_name, brand, image_url)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [listing.title, listing.brand ?? null, listing.imageUrl]
      );
      productId = inserted.rows[0]!.id;
    }

    // Concurrent workers may race on (product_id, store_id) — resolve via upsert.
    const upserted = await client.query<{ id: string }>(
      `INSERT INTO product_listings
         (product_id, store_id, store_product_url, store_sku, current_price, currency, in_stock)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (product_id, store_id) DO UPDATE
         SET current_price = EXCLUDED.current_price,
             currency = EXCLUDED.currency,
             in_stock = EXCLUDED.in_stock,
             store_product_url = EXCLUDED.store_product_url,
             store_sku = COALESCE(EXCLUDED.store_sku, product_listings.store_sku),
             last_checked_at = now()
       RETURNING id`,
      [productId, storeId, listing.url, listing.sku ?? null, listing.price, listing.currency, listing.inStock]
    );
    listingId = upserted.rows[0]!.id;
  }

  // 3. Append history — only on price change, or as a heartbeat every N hours.
  await client.query(
    `INSERT INTO price_history (listing_id, price, currency, in_stock)
     SELECT $1, $2, $3, $4
      WHERE NOT EXISTS (
        SELECT 1 FROM price_history
         WHERE listing_id = $1
           AND price = $2
           AND recorded_at > now() - ($5 || ' hours')::interval
      )`,
    [listingId, listing.price, listing.currency, listing.inStock, String(HISTORY_MIN_INTERVAL_HOURS)]
  );

  return listingId;
}

/**
 * Read side: listings matching a query, for serving searches from the DB
 * (the primary path in queue mode). Freshness is judged by the caller.
 */
export interface DbListingRow {
  listing_id: string;
  store_slug: string;
  title: string;
  url: string;
  image_url: string | null;
  price: number;
  currency: string;
  in_stock: boolean;
  last_checked_at: Date;
}

export async function findListingsByQuery(query: string): Promise<DbListingRow[]> {
  const { rows } = await pool.query<DbListingRow>(
    `SELECT l.id AS listing_id,
            s.slug AS store_slug,
            p.canonical_name AS title,
            l.store_product_url AS url,
            COALESCE(p.image_url, NULL) AS image_url,
            l.current_price AS price,
            l.currency,
            l.in_stock,
            l.last_checked_at
       FROM product_listings l
       JOIN products p ON p.id = l.product_id
       JOIN stores s   ON s.id = l.store_id AND s.is_active
      WHERE p.canonical_name ILIKE '%' || $1 || '%'
         OR p.name_ar ILIKE '%' || $1 || '%'
      ORDER BY l.current_price
      LIMIT 40`,
    [query]
  );
  return rows;
}
