import { pool } from "../lib/db.js";
import { sendPush } from "../lib/push.js";
import { runAdapter } from "../adapters/storeAdapter.js";
import { getAdapter } from "../adapters/index.js";
import { persistListings } from "./catalogService.js";
import { config } from "../config.js";
import { formatPriceAr } from "../lib/format.js";

/**
 * The price-drop alert pipeline, executed by the worker's hourly
 * `price-check` job:
 *
 *   1. refresh — for every listing someone tracks, re-run its store's
 *      adapter (searching by canonical product name) and persist, which
 *      updates current_price and appends price_history on change;
 *   2. evaluate — find tracked listings whose current price dropped below
 *      the user's threshold (target_price, or price_at_save when no
 *      target), throttled to one push per listing per 24h;
 *   3. notify — Arabic push via FCM (dry-run logging without credentials),
 *      then stamp notified_at.
 */

export interface SweepResult {
  refreshedQueries: number;
  alertsSent: number;
}

export async function runPriceCheckSweep(): Promise<SweepResult> {
  const refreshedQueries = await refreshTrackedListings();
  const alertsSent = await evaluateAndNotify();
  return { refreshedQueries, alertsSent };
}

/**
 * Re-fetch prices for tracked listings, deduplicated by (store, product):
 * many users tracking iPhone 16 on Noon = one scrape.
 */
async function refreshTrackedListings(): Promise<number> {
  const { rows } = await pool.query<{
    store_slug: string;
    canonical_name: string;
  }>(
    `SELECT DISTINCT s.slug AS store_slug, p.canonical_name
       FROM tracked_products t
       JOIN product_listings l ON l.id = t.listing_id
       JOIN products p ON p.id = l.product_id
       JOIN stores s   ON s.id = l.store_id AND s.is_active`
  );

  let refreshed = 0;
  for (const row of rows) {
    const adapter = getAdapter(row.store_slug);
    if (!adapter) continue;
    const { listings, failed } = await runAdapter(
      adapter,
      row.canonical_name,
      config.adapterTimeoutMs
    );
    if (!failed && listings.length > 0) {
      await persistListings(listings);
      refreshed++;
    }
  }
  return refreshed;
}

/** One push per tracked listing per 24h, only while the drop condition holds. */
async function evaluateAndNotify(): Promise<number> {
  const { rows } = await pool.query<AlertRow>(
    `SELECT t.id AS tracked_id,
            u.push_token,
            u.preferred_language,
            p.canonical_name,
            p.name_ar,
            s.name_ar AS store_name_ar,
            l.id AS listing_id,
            l.current_price,
            l.currency,
            l.store_product_url,
            COALESCE(t.target_price, t.price_at_save) AS threshold
       FROM tracked_products t
       JOIN users u ON u.id = t.user_id
       JOIN product_listings l ON l.id = t.listing_id
       JOIN products p ON p.id = l.product_id
       JOIN stores s   ON s.id = l.store_id
      WHERE u.push_token IS NOT NULL
        AND l.in_stock
        AND l.current_price < COALESCE(t.target_price, t.price_at_save)
        AND (t.notified_at IS NULL OR t.notified_at < now() - interval '24 hours')`
  );

  let sent = 0;
  for (const row of rows) {
    const productName = row.name_ar ?? row.canonical_name;
    const priceText = formatPriceAr(row.current_price, row.currency);

    const result = await sendPush({
      token: row.push_token,
      title: "انخفض السعر! 🎉",
      body: `انخفض سعر ${productName} إلى ${priceText} في ${row.store_name_ar}`,
      data: {
        type: "price_drop",
        listing_id: row.listing_id,
        url: row.store_product_url,
      },
    });

    // Dry-run counts as sent for throttling — otherwise local runs would
    // re-log the same alert every sweep.
    if (result.delivered || result.dryRun) {
      await pool.query(
        `UPDATE tracked_products SET notified_at = now() WHERE id = $1`,
        [row.tracked_id]
      );
      sent++;
    } else {
      console.warn(
        `[alerts] push failed for tracked=${row.tracked_id}: ${result.error}`
      );
    }
  }
  return sent;
}

interface AlertRow {
  tracked_id: string;
  push_token: string;
  preferred_language: string;
  canonical_name: string;
  name_ar: string | null;
  store_name_ar: string;
  listing_id: string;
  current_price: number;
  currency: string;
  store_product_url: string;
  threshold: number;
}
