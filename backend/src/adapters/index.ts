import type { StoreAdapter } from "./storeAdapter.js";
import { amazonSaAdapter } from "./amazonSaAdapter.js";
import { noonAdapter } from "./noonAdapter.js";

/**
 * Registry of store integrations, shared by the API (inline mode) and the
 * worker (queue mode). Adding a store = adding an adapter here.
 */
export const ADAPTERS: StoreAdapter[] = [amazonSaAdapter, noonAdapter];

export function getAdapter(storeSlug: string): StoreAdapter | undefined {
  return ADAPTERS.find((a) => a.storeSlug === storeSlug);
}
