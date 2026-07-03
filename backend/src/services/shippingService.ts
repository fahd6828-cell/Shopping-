import { pool } from "../lib/db.js";
import { convertCurrency } from "../config.js";
import type { ShippingDto } from "../types.js";

interface ShippingRateRow {
  store_slug: string;
  base_cost: number;
  currency: string;
  free_shipping_threshold: number | null;
  est_days_min: number;
  est_days_max: number;
}

/** All shipping rates for the given stores to one destination country. */
export async function getShippingRates(
  storeSlugs: string[],
  destinationCountry: string
): Promise<Map<string, ShippingRateRow>> {
  const byStore = new Map<string, ShippingRateRow>();
  if (storeSlugs.length === 0) return byStore;

  const { rows } = await pool.query<ShippingRateRow>(
    `SELECT s.slug AS store_slug,
            r.base_cost,
            r.currency,
            r.free_shipping_threshold,
            r.est_days_min,
            r.est_days_max
       FROM shipping_rates r
       JOIN stores s ON s.id = r.store_id
      WHERE s.slug = ANY($1)
        AND r.destination_country = $2`,
    [storeSlugs, destinationCountry]
  );

  for (const row of rows) byStore.set(row.store_slug, row);
  return byStore;
}

/**
 * Resolve the shipping cost for one offer, in the shopper's currency.
 *
 * The free-shipping threshold is defined in the rate's own currency, so the
 * comparison happens there; the returned cost is converted for display.
 * Returns null when the store has no rate to that country (offer is still
 * shown, flagged "shipping unknown" by the clients).
 */
export function resolveShipping(
  rate: ShippingRateRow | undefined,
  itemPrice: number,
  itemCurrency: string,
  targetCurrency: string
): ShippingDto | null {
  if (!rate) return null;

  const priceInRateCurrency = convertCurrency(
    itemPrice,
    itemCurrency,
    rate.currency
  );
  const isFree =
    rate.free_shipping_threshold !== null &&
    priceInRateCurrency >= rate.free_shipping_threshold;

  return {
    cost: isFree ? 0 : convertCurrency(rate.base_cost, rate.currency, targetCurrency),
    is_free: isFree,
    est_days_min: rate.est_days_min,
    est_days_max: rate.est_days_max,
  };
}
