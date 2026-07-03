import type { StoreAdapter } from "./storeAdapter.js";
import type { RawListing } from "../types.js";

/**
 * Amazon.sa adapter — MOCK implementation shaped like the Amazon Product
 * Advertising API (PA-API 5) SearchItems response, so the real integration
 * only replaces `fetchFromPaApi` with a signed PA-API call
 * (docs: https://webservices.amazon.com/paapi5/documentation/).
 */
class AmazonSaAdapter implements StoreAdapter {
  readonly storeSlug = "amazon-sa";

  async search(query: string, signal: AbortSignal): Promise<RawListing[]> {
    const response = await this.fetchFromPaApi(query, signal);
    return response.SearchResult.Items.filter(
      (item) => item.Offers?.Listings?.[0]
    ).map((item) => {
      const listing = item.Offers!.Listings[0]!;
      return {
        storeSlug: this.storeSlug,
        title: item.ItemInfo.Title.DisplayValue,
        url: item.DetailPageURL,
        imageUrl: item.Images?.Primary?.Large?.URL ?? null,
        price: listing.Price.Amount,
        currency: listing.Price.Currency,
        inStock: listing.Availability?.Type !== "OUT_OF_STOCK",
      };
    });
  }

  /**
   * PRODUCTION: replace this stub with a real signed PA-API request using
   * the store's affiliate credentials. Mock latency (150–400 ms) keeps the
   * concurrency and timeout paths realistic in development.
   */
  private async fetchFromPaApi(
    query: string,
    signal: AbortSignal
  ): Promise<PaApiSearchResponse> {
    await simulateNetwork(150 + Math.random() * 250, signal);

    const seed = hashQuery(query);
    const basePrice = 500 + (seed % 3500);
    return {
      SearchResult: {
        Items: [
          {
            ASIN: `B0${(seed % 900000) + 100000}X`,
            DetailPageURL: `https://www.amazon.sa/dp/B0${(seed % 900000) + 100000}X?tag=souqly-21`,
            ItemInfo: { Title: { DisplayValue: titleCase(query) } },
            Images: {
              Primary: {
                Large: {
                  URL: `https://m.media-amazon.com/images/I/${seed}.jpg`,
                },
              },
            },
            Offers: {
              Listings: [
                {
                  Price: { Amount: round2(basePrice * 1.04), Currency: "SAR" },
                  Availability: { Type: "NOW" },
                },
              ],
            },
          },
          {
            ASIN: `B0${(seed % 900000) + 200000}R`,
            DetailPageURL: `https://www.amazon.sa/dp/B0${(seed % 900000) + 200000}R?tag=souqly-21`,
            ItemInfo: {
              Title: { DisplayValue: `${titleCase(query)} (Renewed)` },
            },
            Images: null,
            Offers: {
              Listings: [
                {
                  Price: { Amount: round2(basePrice * 0.82), Currency: "SAR" },
                  Availability: { Type: "NOW" },
                },
              ],
            },
          },
        ],
      },
    };
  }
}

/* ---------- PA-API response shape (subset we consume) ---------- */
interface PaApiSearchResponse {
  SearchResult: {
    Items: Array<{
      ASIN: string;
      DetailPageURL: string;
      ItemInfo: { Title: { DisplayValue: string } };
      Images: { Primary?: { Large?: { URL: string } } } | null;
      Offers: {
        Listings: Array<{
          Price: { Amount: number; Currency: string };
          Availability?: { Type: string };
        }>;
      } | null;
    }>;
  };
}

/* ---------- helpers ---------- */
function simulateNetwork(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error("aborted"));
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new Error("adapter timeout"));
      },
      { once: true }
    );
  });
}

/** Deterministic per-query hash so mock prices are stable across calls. */
function hashQuery(query: string): number {
  let h = 0;
  for (const ch of query.toLowerCase()) {
    h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return h;
}

function titleCase(s: string): string {
  return s.replace(/\p{L}+/gu, (w) => w[0]!.toUpperCase() + w.slice(1));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const amazonSaAdapter = new AmazonSaAdapter();
export { hashQuery, simulateNetwork, titleCase, round2 };
