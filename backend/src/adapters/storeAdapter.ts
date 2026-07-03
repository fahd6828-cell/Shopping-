import type { RawListing } from "../types.js";

/**
 * Every store integration — scraper, affiliate API, or mock — implements
 * this interface, so swapping a mock for Amazon PA-API or a Playwright
 * scraper is a drop-in change confined to one file.
 */
export interface StoreAdapter {
  /** Must match `stores.slug` in the database. */
  readonly storeSlug: string;

  /**
   * Search the store for a product. Implementations must respect
   * AbortSignal so a slow/blocked store cannot stall the whole comparison.
   */
  search(query: string, signal: AbortSignal): Promise<RawListing[]>;
}

/**
 * Runs one adapter with a hard timeout. Returns [] and reports failure
 * instead of throwing — one broken store never kills the response.
 */
export async function runAdapter(
  adapter: StoreAdapter,
  query: string,
  timeoutMs: number
): Promise<{ listings: RawListing[]; failed: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const listings = await adapter.search(query, controller.signal);
    return { listings, failed: false };
  } catch (err) {
    console.warn(
      `[adapter:${adapter.storeSlug}] search failed:`,
      (err as Error).message
    );
    return { listings: [], failed: true };
  } finally {
    clearTimeout(timer);
  }
}
