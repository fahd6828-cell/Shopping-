import { pool } from "../lib/db.js";
import type { CouponDto } from "../types.js";

/**
 * Active, verified coupons for a set of stores in one round trip.
 * Served by the partial index idx_coupons_active.
 *
 * Returns a map of storeSlug -> coupons, best-first (highest crowd success
 * ratio, then biggest discount).
 */
export async function getActiveCouponsByStore(
  storeSlugs: string[]
): Promise<Map<string, CouponDto[]>> {
  const byStore = new Map<string, CouponDto[]>();
  if (storeSlugs.length === 0) return byStore;

  const { rows } = await pool.query<CouponRow>(
    `SELECT s.slug AS store_slug,
            c.code,
            c.description_ar,
            c.description_en,
            c.discount_type,
            c.discount_value,
            c.min_order_value,
            c.valid_until
       FROM coupons c
       JOIN stores s ON s.id = c.store_id
      WHERE s.slug = ANY($1)
        AND c.is_verified
        AND c.valid_from  <= now()
        AND c.valid_until >  now()
      ORDER BY s.slug,
               (c.success_count + 1)::float / (c.success_count + c.fail_count + 2) DESC,
               c.discount_value DESC`,
    [storeSlugs]
  );

  for (const row of rows) {
    const list = byStore.get(row.store_slug) ?? [];
    list.push({
      code: row.code,
      description_ar: row.description_ar,
      description_en: row.description_en,
      discount_type: row.discount_type,
      discount_value: row.discount_value,
      min_order_value: row.min_order_value,
      valid_until: row.valid_until.toISOString(),
    });
    byStore.set(row.store_slug, list);
  }
  return byStore;
}

interface CouponRow {
  store_slug: string;
  code: string;
  description_ar: string;
  description_en: string | null;
  discount_type: "percent" | "fixed" | "free_shipping";
  discount_value: number;
  min_order_value: number | null;
  valid_until: Date;
}
