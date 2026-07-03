/**
 * Typed client for the Souqly backend. The DTO types mirror
 * backend/src/types.ts — the API contract both clients render.
 */

// PRODUCTION: read from react-native-config / app config per environment.
// 10.0.2.2 reaches the host machine from the Android emulator.
const API_BASE_URL = "http://10.0.2.2:3000";

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
  product_title: string;
  product_url: string;
  image_url: string | null;
  in_stock: boolean;
  price: number;
  original_price: number;
  original_currency: string;
  shipping: ShippingDto | null;
  total_price: number;
  currency: string;
  coupons: CouponDto[];
}

export interface SearchResponseDto {
  query: string;
  country: string;
  currency: string;
  results: StoreOfferDto[];
  failed_stores: string[];
  cached: boolean;
  fetched_at: string;
}

export async function searchProducts(
  query: string,
  country: string,
  signal?: AbortSignal
): Promise<SearchResponseDto> {
  const url =
    `${API_BASE_URL}/api/search` +
    `?query=${encodeURIComponent(query)}&country=${encodeURIComponent(country)}`;

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`search failed with status ${response.status}`);
  }
  return (await response.json()) as SearchResponseDto;
}
