/**
 * سوقلي — service worker (Manifest V3, ES module)
 *
 * Receives detected products from content scripts, queries the Souqly
 * backend for the cross-store comparison, caches the result per tab in
 * chrome.storage.session, badges the toolbar icon with the number of
 * cheaper offers, and tells the content script to show the on-page
 * banner when there's real money to save.
 */

import { getSettings } from "./shared/settings.js";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "PRODUCT_DETECTED" && sender.tab) {
    handleProductDetected(message.product, sender.tab.id).catch((err) =>
      console.warn("[souqly] compare failed:", err.message)
    );
    return false;
  }

  // Popup asks for the cached comparison of its active tab.
  if (message && message.type === "GET_COMPARISON") {
    getTabState(message.tabId).then(sendResponse);
    return true; // async sendResponse
  }

  return false;
});

async function handleProductDetected(product, tabId) {
  if (!product || !product.title) return;

  await setTabState(tabId, { status: "loading", product });

  const settings = await getSettings();
  const url =
    `${settings.apiBaseUrl}/api/search` +
    `?query=${encodeURIComponent(cleanTitle(product.title))}` +
    `&country=${settings.country}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    const comparison = await res.json();

    await setTabState(tabId, { status: "ready", product, comparison });
    updateBadge(tabId, product, comparison);
    maybeShowBanner(tabId, product, comparison);

    // Data still refreshing server-side (worker scraping): try once more
    // shortly so the tab ends up with the complete comparison.
    if (comparison.refreshing) {
      setTimeout(() => {
        handleProductDetected(product, tabId).catch(() => {});
      }, 4000);
    }
  } catch (err) {
    await setTabState(tabId, { status: "error", product, error: err.message });
    chrome.action.setBadgeText({ tabId, text: "" });
  }
}

/** Offers strictly cheaper than what the user is looking at. */
function cheaperOffers(product, comparison) {
  const offers = (comparison && comparison.results) || [];
  if (typeof product.price !== "number") return [];
  return offers.filter((o) => o.total_price < product.price);
}

function updateBadge(tabId, product, comparison) {
  const cheaper = cheaperOffers(product, comparison);
  const count =
    typeof product.price === "number"
      ? cheaper.length
      : ((comparison && comparison.results) || []).length;

  chrome.action.setBadgeBackgroundColor({ tabId, color: "#0e9f6e" });
  chrome.action.setBadgeText({ tabId, text: count > 0 ? String(count) : "" });
}

/** On-page banner only when the best alternative saves a meaningful amount. */
function maybeShowBanner(tabId, product, comparison) {
  const cheaper = cheaperOffers(product, comparison);
  const best = cheaper[0]; // results are sorted by total ascending
  if (!best) return;

  const savings = product.price - best.total_price;
  if (savings < 1) return;

  chrome.tabs
    .sendMessage(tabId, {
      type: "SHOW_BANNER",
      banner: {
        savings,
        currency: best.currency,
        storeNameAr: best.store.name_ar || best.store.name,
        offerUrl: best.product_url,
        couponCode: best.coupons?.[0]?.code ?? null,
      },
    })
    .catch(() => {
      /* tab navigated away — nothing to do */
    });
}

/**
 * Store titles carry noise that hurts search relevance
 * ("Apple iPhone 16 (128 GB) - Black | Official Warranty ...").
 * Keep the head of the title, drop bracketed/piped tails.
 */
function cleanTitle(title) {
  return title
    .split("|")[0]
    .split(" - ")[0]
    .replace(/[()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 8)
    .join(" ");
}

/* ---------- per-tab session state ---------- */

function tabKey(tabId) {
  return `tab:${tabId}`;
}

async function setTabState(tabId, state) {
  await chrome.storage.session.set({
    [tabKey(tabId)]: { ...state, updated_at: Date.now() },
  });
}

async function getTabState(tabId) {
  const data = await chrome.storage.session.get(tabKey(tabId));
  return data[tabKey(tabId)] || null;
}

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(tabKey(tabId));
});
