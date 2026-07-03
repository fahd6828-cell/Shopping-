/**
 * Typed client for the Souqly backend. The DTO types mirror
 * backend/src/types.ts — the API contract both clients render.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// PRODUCTION: read from react-native-config / app config per environment.
// 10.0.2.2 reaches the host machine from the Android emulator.
const API_BASE_URL = "http://10.0.2.2:3000";

const COUNTRY_KEY = "souqly:country";
const DEVICE_ID_KEY = "souqly:device_id";

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
  listing_id: string | null;
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
  refreshing: boolean;
  cached: boolean;
  fetched_at: string;
}

export interface TrackedItemDto {
  listing_id: string;
  target_price: number | null;
  price_at_save: number;
  tracked_at: string;
  canonical_name: string;
  name_ar: string | null;
  image_url: string | null;
  store_slug: string;
  store_name_ar: string;
  current_price: number;
  currency: string;
  in_stock: boolean;
  store_product_url: string;
}

export interface PricePointDto {
  price: number;
  currency: string;
  at: string;
}

/* ------------------------------------------------------------------ */
/* preferences + device identity                                       */
/* ------------------------------------------------------------------ */

export async function getCountry(): Promise<string> {
  return (await AsyncStorage.getItem(COUNTRY_KEY)) ?? "SA";
}

export async function setCountry(country: string): Promise<void> {
  await AsyncStorage.setItem(COUNTRY_KEY, country);
  // Backend keeps the device's country in sync for push copy/shipping.
  registerDevice().catch(() => {});
}

/**
 * Stable anonymous identity: generated once, stored forever, sent as
 * X-Device-Id. RFC4122-v4 shaped; Math.random is acceptable for a
 * non-security identifier — swap for expo-crypto/react-native-uuid when
 * available in the app shell.
 */
export async function getDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

/** Registers/refreshes this device with the backend (idempotent upsert). */
export async function registerDevice(pushToken?: string): Promise<void> {
  const [deviceId, country] = await Promise.all([getDeviceId(), getCountry()]);
  await fetch(`${API_BASE_URL}/api/users/device`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      device_id: deviceId,
      country,
      ...(pushToken ? { push_token: pushToken } : {}),
    }),
  });
}

async function deviceHeaders(): Promise<Record<string, string>> {
  return {
    "Content-Type": "application/json",
    "X-Device-Id": await getDeviceId(),
  };
}

/* ------------------------------------------------------------------ */
/* API calls                                                           */
/* ------------------------------------------------------------------ */

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

export async function trackListing(
  listingId: string,
  targetPrice?: number
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/track`, {
    method: "POST",
    headers: await deviceHeaders(),
    body: JSON.stringify({
      listing_id: listingId,
      ...(targetPrice ? { target_price: targetPrice } : {}),
    }),
  });
  if (response.status === 401) {
    // First call on a fresh install: device not registered yet.
    await registerDevice();
    return trackListing(listingId, targetPrice);
  }
  if (!response.ok) throw new Error(`track failed with status ${response.status}`);
}

export async function untrackListing(listingId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/track/${listingId}`, {
    method: "DELETE",
    headers: await deviceHeaders(),
  });
  if (!response.ok) throw new Error(`untrack failed with status ${response.status}`);
}

export async function getTracked(): Promise<TrackedItemDto[]> {
  const response = await fetch(`${API_BASE_URL}/api/tracked`, {
    headers: await deviceHeaders(),
  });
  if (response.status === 401) return [];
  if (!response.ok) throw new Error(`tracked failed with status ${response.status}`);
  const body = (await response.json()) as { tracked: TrackedItemDto[] };
  return body.tracked;
}

export async function getPriceHistory(
  listingId: string
): Promise<PricePointDto[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/listings/${listingId}/history`
  );
  if (!response.ok) throw new Error(`history failed with status ${response.status}`);
  const body = (await response.json()) as { points: PricePointDto[] };
  return body.points;
}
