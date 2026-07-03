/**
 * سوقلي — service worker (Manifest V3)
 *
 * Receives detected products from content scripts, queries the Souqly
 * backend for the cross-store comparison, caches the result per tab in
 * chrome.storage.session (survives the worker being suspended, cleared
 * when the browser closes), and badges the toolbar icon with the number
 * of cheaper offers found elsewhere.
 */

"use strict";

// PRODUCTION: point at the deployed API and mirror it in host_permissions.
const API_BASE_URL = "http://localhost:3000";

/** Store slug → country whose shipping rates make the comparison fair. */
const STORE_COUNTRY = {
  "amazon-sa": "SA",
  "amazon-ae": "AE",
  noon: "AE",
  namshi: "AE",
  trendyol: "SA",
};

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

  const country = STORE_COUNTRY[product.store] || "SA";
  const url =
    `${API_BASE_URL}/api/search` +
    `?query=${encodeURIComponent(cleanTitle(product.title))}` +
    `&country=${country}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    const comparison = await res.json();

    await setTabState(tabId, { status: "ready", product, comparison });
    updateBadge(tabId, product, comparison);
  } catch (err) {
    await setTabState(tabId, {
      status: "error",
      product,
      error: err.message,
    });
    chrome.action.setBadgeText({ tabId, text: "" });
  }
}

/**
 * Badge = number of offers cheaper than what the user is looking at.
 * No price extracted → show total number of offers instead.
 */
function updateBadge(tabId, product, comparison) {
  const offers = (comparison && comparison.results) || [];
  const count =
    typeof product.price === "number"
      ? offers.filter((o) => o.total_price < product.price).length
      : offers.length;

  chrome.action.setBadgeBackgroundColor({ tabId, color: "#0e9f6e" });
  chrome.action.setBadgeText({
    tabId,
    text: count > 0 ? String(count) : "",
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
