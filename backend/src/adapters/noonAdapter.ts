import type { StoreAdapter } from "./storeAdapter.js";
import type { RawListing } from "../types.js";
import { config } from "../config.js";
import {
  fetchNoonSearchHtml,
  parseNoonSearchHtml,
  type NoonScrapedHit,
} from "./noonScraper.js";
import { hashQuery, round2, simulateNetwork, titleCase } from "./mockUtils.js";

/**
 * Noon adapter. With SCRAPER_ENABLED=true (worker process) it drives real
 * Playwright scraping via noonScraper.ts; otherwise it serves a
 * deterministic mock with the same scraped-payload shape, so the mapping
 * below is the single parse path either way.
 */
class NoonAdapter implements StoreAdapter {
  readonly storeSlug = "noon";

  async search(query: string, signal: AbortSignal): Promise<RawListing[]> {
    const hits = config.scraperEnabled
      ? parseNoonSearchHtml(await fetchNoonSearchHtml(query, signal))
      : await this.mockSearchPage(query, signal);

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

  /** Mock in the scraper's output shape; latency keeps timeouts realistic. */
  private async mockSearchPage(
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
        price: round2(basePrice * 1.02 * 1.02),
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

export const noonAdapter = new NoonAdapter();
