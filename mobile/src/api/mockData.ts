import type { SearchResponseDto } from "./client";

/**
 * Offline fixture matching the live API contract — lets the screen render
 * in development (and in Storybook/snapshot tests) without a backend.
 */
export const MOCK_SEARCH_RESPONSE: SearchResponseDto = {
  query: "آيفون 16",
  country: "SA",
  currency: "SAR",
  cached: false,
  failed_stores: [],
  refreshing: false,
  fetched_at: new Date().toISOString(),
  results: [
    {
      listing_id: null,
      store: {
        slug: "noon",
        name: "Noon",
        name_ar: "نون",
        logo_url: null,
      },
      product_title: "Apple iPhone 16 128GB - Black",
      product_url: "https://www.noon.com/uae-en/N70106183V/p",
      image_url: null,
      in_stock: true,
      price: 3318.19,
      original_price: 3249.0,
      original_currency: "AED",
      shipping: { cost: 0, is_free: true, est_days_min: 1, est_days_max: 3 },
      total_price: 3318.19,
      currency: "SAR",
      coupons: [
        {
          code: "NOON20",
          description_ar: "خصم 20% للمستخدمين الجدد",
          description_en: "20% off for new users",
          discount_type: "percent",
          discount_value: 20,
          min_order_value: 50,
          valid_until: "2026-09-01T00:00:00Z",
        },
      ],
    },
    {
      listing_id: null,
      store: {
        slug: "amazon-sa",
        name: "Amazon Saudi Arabia",
        name_ar: "أمازون السعودية",
        logo_url: null,
      },
      product_title: "Apple iPhone 16 (128GB) - أسود",
      product_url: "https://www.amazon.sa/dp/B0DGHV3J5K",
      image_url: null,
      in_stock: true,
      price: 3399.0,
      original_price: 3399.0,
      original_currency: "SAR",
      shipping: { cost: 0, is_free: true, est_days_min: 1, est_days_max: 3 },
      total_price: 3399.0,
      currency: "SAR",
      coupons: [
        {
          code: "SOUQLY10",
          description_ar: "خصم 10% على الإلكترونيات (حتى 100 ريال)",
          description_en: "10% off electronics (max SAR 100)",
          discount_type: "percent",
          discount_value: 10,
          min_order_value: 100,
          valid_until: "2026-08-22T00:00:00Z",
        },
      ],
    },
    {
      listing_id: null,
      store: {
        slug: "amazon-ae",
        name: "Amazon UAE",
        name_ar: "أمازون الإمارات",
        logo_url: null,
      },
      product_title: "Apple iPhone 16 128GB",
      product_url: "https://www.amazon.ae/dp/B0DGHV3J5K",
      image_url: null,
      in_stock: true,
      price: 3369.63,
      original_price: 3299.0,
      original_currency: "AED",
      shipping: {
        cost: 30.64,
        is_free: false,
        est_days_min: 3,
        est_days_max: 7,
      },
      total_price: 3400.27,
      currency: "SAR",
      coupons: [],
    },
  ],
};
