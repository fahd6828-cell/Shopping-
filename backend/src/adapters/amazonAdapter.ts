import type { StoreAdapter } from "./storeAdapter.js";
import type { RawListing } from "../types.js";
import {
  isPaapiConfigured,
  paapiSearchItems,
  type PaapiMarketplaceConfig,
} from "./paapiClient.js";
import { hashQuery, round2, simulateNetwork, titleCase } from "./mockUtils.js";

/**
 * Amazon adapter, one instance per marketplace (amazon.sa / amazon.ae).
 *
 * With PA-API credentials configured (AMAZON_PAAPI_* env vars) it makes
 * real signed SearchItems calls; without them it serves a deterministic
 * mock with the exact same response shape, so the mapping below is the
 * single parse path either way.
 */
class AmazonAdapter implements StoreAdapter {
  private warnedMock = false;

  constructor(
    readonly storeSlug: string,
    private readonly marketplaceCfg: PaapiMarketplaceConfig,
    private readonly currency: string,
    private readonly affiliateTag: string
  ) {}

  async search(query: string, signal: AbortSignal): Promise<RawListing[]> {
    let response: PaApiSearchResponse;
    if (isPaapiConfigured()) {
      response = (await paapiSearchItems(
        this.marketplaceCfg,
        query,
        signal
      )) as PaApiSearchResponse;
    } else {
      if (!this.warnedMock) {
        this.warnedMock = true;
        console.warn(
          `[adapter:${this.storeSlug}] PA-API credentials not set — serving mock data`
        );
      }
      response = await this.mockSearchItems(query, signal);
    }

    return (response.SearchResult?.Items ?? [])
      .filter((item) => item.Offers?.Listings?.[0])
      .map((item) => {
        const listing = item.Offers!.Listings[0]!;
        return {
          storeSlug: this.storeSlug,
          title: item.ItemInfo.Title.DisplayValue,
          url: item.DetailPageURL,
          imageUrl: item.Images?.Primary?.Large?.URL ?? null,
          price: listing.Price.Amount,
          currency: listing.Price.Currency,
          inStock: listing.Availability?.Type !== "OUT_OF_STOCK",
          sku: item.ASIN,
          brand: item.ItemInfo.ByLineInfo?.Brand?.DisplayValue ?? null,
        };
      });
  }

  /** Mock with PA-API response shape; latency keeps timeout paths realistic. */
  private async mockSearchItems(
    query: string,
    signal: AbortSignal
  ): Promise<PaApiSearchResponse> {
    await simulateNetwork(150 + Math.random() * 250, signal);

    const seed = hashQuery(`${this.storeSlug}:${query}`);
    const basePrice = 500 + (seed % 3500);
    const domain = this.marketplaceCfg.marketplace;
    return {
      SearchResult: {
        Items: [
          {
            ASIN: `B0${(seed % 900000) + 100000}X`,
            DetailPageURL: `https://${domain}/dp/B0${(seed % 900000) + 100000}X?tag=${this.affiliateTag}`,
            ItemInfo: { Title: { DisplayValue: titleCase(query) } },
            Images: {
              Primary: {
                Large: { URL: `https://m.media-amazon.com/images/I/${seed}.jpg` },
              },
            },
            Offers: {
              Listings: [
                {
                  Price: { Amount: round2(basePrice * 1.04), Currency: this.currency },
                  Availability: { Type: "NOW" },
                },
              ],
            },
          },
          {
            ASIN: `B0${(seed % 900000) + 200000}R`,
            DetailPageURL: `https://${domain}/dp/B0${(seed % 900000) + 200000}R?tag=${this.affiliateTag}`,
            ItemInfo: { Title: { DisplayValue: `${titleCase(query)} (Renewed)` } },
            Images: null,
            Offers: {
              Listings: [
                {
                  Price: { Amount: round2(basePrice * 0.82), Currency: this.currency },
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

/** Subset of the PA-API SearchItems response we consume. */
export interface PaApiSearchResponse {
  SearchResult?: {
    Items: Array<{
      ASIN: string;
      DetailPageURL: string;
      ItemInfo: {
        Title: { DisplayValue: string };
        ByLineInfo?: { Brand?: { DisplayValue: string } };
      };
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

// PA-API region for both GCC marketplaces is eu-west-1.
export const amazonSaAdapter = new AmazonAdapter(
  "amazon-sa",
  { host: "webservices.amazon.sa", region: "eu-west-1", marketplace: "www.amazon.sa" },
  "SAR",
  "souqly-21"
);

export const amazonAeAdapter = new AmazonAdapter(
  "amazon-ae",
  { host: "webservices.amazon.ae", region: "eu-west-1", marketplace: "www.amazon.ae" },
  "AED",
  "souqly-21"
);
