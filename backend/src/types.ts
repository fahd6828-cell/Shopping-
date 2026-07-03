/**
 * Shared API contract types. The browser extension and the mobile app render
 * exactly this shape — keep changes backward-compatible.
 */

/** What a store adapter yields before enrichment (shipping, coupons, FX). */
export interface RawListing {
  storeSlug: string;
  title: string;
  url: string;
  imageUrl: string | null;
  price: number;
  currency: string;
  inStock: boolean;
  /** Store-native SKU (ASIN, Noon SKU) — primary key for re-checks. */
  sku?: string | null;
  brand?: string | null;
}

export interface CouponDto {
  code: string;
  description_ar: string;
  description_en: string | null;
  discount_type: "percent" | "fixed" | "free_shipping";
  discount_value: number;
  min_order_value: number | null;
  valid_until: string;
}

export interface ShippingDto {
  /** Cost in the offer's display currency; 0 when threshold reached. */
  cost: number;
  is_free: boolean;
  est_days_min: number;
  est_days_max: number;
}

export interface StoreOfferDto {
  store: {
    slug: string;
    name: string;
    name_ar: string;
    logo_url: string | null;
  };
  /** DB listing id — used by clients to track this offer for price alerts. */
  listing_id: string | null;
  product_title: string;
  product_url: string;
  image_url: string | null;
  in_stock: boolean;
  /** Item price converted to the shopper's currency. */
  price: number;
  /** Original store price, untouched — shown as a secondary line. */
  original_price: number;
  original_currency: string;
  shipping: ShippingDto | null;
  /** price + shipping, in the shopper's currency. Sort key. */
  total_price: number;
  currency: string;
  coupons: CouponDto[];
}

export interface SearchResponseDto {
  query: string;
  country: string;
  currency: string;
  results: StoreOfferDto[];
  /** Slugs of stores that failed/timed out this round (partial results). */
  failed_stores: string[];
  /**
   * True when background scrape jobs were still running at response time —
   * clients should re-query in a few seconds for complete results.
   */
  refreshing: boolean;
  cached: boolean;
  fetched_at: string;
}
