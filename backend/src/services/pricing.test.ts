import { describe, expect, it } from "vitest";
import { convertCurrency } from "../config.js";
import { resolveShipping } from "./shippingService.js";
import { normalizeQuery } from "./searchService.js";

describe("convertCurrency", () => {
  it("is identity for same currency", () => {
    expect(convertCurrency(100, "SAR", "SAR")).toBe(100);
  });

  it("converts AED to SAR near the peg (~1.021)", () => {
    const sar = convertCurrency(100, "AED", "SAR");
    expect(sar).toBeGreaterThan(101);
    expect(sar).toBeLessThan(103.5);
  });

  it("throws on unknown currency", () => {
    expect(() => convertCurrency(1, "XXX", "SAR")).toThrow();
  });
});

describe("resolveShipping", () => {
  const rate = {
    store_slug: "noon",
    base_cost: 12,
    currency: "SAR",
    free_shipping_threshold: 100,
    est_days_min: 1,
    est_days_max: 3,
  };

  it("returns null when the store does not ship to the country", () => {
    expect(resolveShipping(undefined, 500, "SAR", "SAR")).toBeNull();
  });

  it("charges base cost below the free-shipping threshold", () => {
    const s = resolveShipping(rate, 50, "SAR", "SAR");
    expect(s).toEqual({
      cost: 12,
      is_free: false,
      est_days_min: 1,
      est_days_max: 3,
    });
  });

  it("is free at or above the threshold", () => {
    const s = resolveShipping(rate, 100, "SAR", "SAR");
    expect(s?.cost).toBe(0);
    expect(s?.is_free).toBe(true);
  });

  it("compares the threshold in the rate currency, not the item currency", () => {
    // 95 AED ≈ 97 SAR < 100 SAR threshold → not free
    const below = resolveShipping(rate, 95, "AED", "AED");
    expect(below?.is_free).toBe(false);
    // 120 AED ≈ 122.5 SAR ≥ 100 SAR threshold → free
    const above = resolveShipping(rate, 120, "AED", "AED");
    expect(above?.is_free).toBe(true);
  });

  it("never treats a NULL threshold as free shipping", () => {
    const s = resolveShipping(
      { ...rate, free_shipping_threshold: null },
      99999,
      "SAR",
      "SAR"
    );
    expect(s?.is_free).toBe(false);
    expect(s?.cost).toBe(12);
  });
});

describe("normalizeQuery", () => {
  it("lowercases and collapses whitespace for cache-key stability", () => {
    expect(normalizeQuery("  iPhone   16  ")).toBe("iphone 16");
  });

  it("preserves Arabic text", () => {
    expect(normalizeQuery("آيفون  ١٦")).toBe("آيفون ١٦");
  });
});
