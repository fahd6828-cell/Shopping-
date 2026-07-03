import type { StoreAdapter } from "./storeAdapter.js";
import type { RawListing } from "../types.js";
import {
  hashQuery,
  simulateNetwork,
  titleCase,
  round2,
} from "./amazonSaAdapter.js";

/**
 * Noon adapter — MOCK implementation shaped like a scraped Noon search
 * payload. The real integration replaces `scrapeSearchPage` with a
 * Playwright routine (headless page → search URL → parse product grid),
 * keeping everything above it untouched.
 *
 * PRODUCTION scraping notes:
 *  - run Playwright in a separate worker pool, never in the API process;
 *  - rotate residential proxies + realistic UA/locale (ar-AE) headers;
 *  - respect the 3h Redis cache upstream so each query hits Noon at most
 *    once per TTL window.
 */
class NoonAdapter implements StoreAdapter {
  readonly storeSlug = "noon";

  async search(query: string, signal: AbortSignal): Promise<RawListing[]> {
    const hits = await this.scrapeSearchPage(query, signal);
    return hits.map((hit) => ({
      storeSlug: this.storeSlug,
      title: hit.name,
      url: `https://www.noon.com/uae-en/${hit.sku}/p`,
      imageUrl: hit.image_key
        ? `https://f.nooncdn.com/p/${hit.image_key}.jpg`
        : null,
      price: hit.sale_price ?? hit.price,
      currency: "AED",
      inStock: hit.is_buyable,
      sku: hit.sku,
    }));
  }

  /** PRODUCTION: replace with a Playwright scrape (see class doc). */
  private async scrapeSearchPage(
    query: string,
    signal: AbortSignal
  ): Promise<NoonScrapedHit[]> {
    await simulateNetwork(200 + Math.random() * 300, signal);

    const seed = hashQuery(query);
    const basePrice = 500 + (seed % 3500);
    return [
      {
        sku: `N${(seed % 90000000) + 10000000}V`,
        name: titleCase(query),
        image_key: `v${seed}`,
        price: round2(basePrice * 1.02 * 1.02), // AED sticker price
        sale_price: round2(basePrice * 0.97),
        is_buyable: true,
      },
      {
        sku: `N${(seed % 90000000) + 20000000}V`,
        name: `${titleCase(query)} - International Version`,
        image_key: null,
        price: round2(basePrice * 0.94),
        sale_price: null,
        is_buyable: true,
      },
    ];
  }
}

/** Shape produced by the (future) Playwright scrape of Noon's search grid. */
interface NoonScrapedHit {
  sku: string;
  name: string;
  image_key: string | null;
  price: number;
  sale_price: number | null;
  is_buyable: boolean;
}

export const noonAdapter = new NoonAdapter();
