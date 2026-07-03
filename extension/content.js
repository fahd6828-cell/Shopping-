/**
 * سوقلي — content script
 *
 * Runs on supported store pages, decides whether the current URL is a
 * product page, extracts the product title + displayed price from the DOM,
 * and hands the result to the service worker (background.js), which queries
 * the Souqly backend for cheaper alternatives and coupons.
 *
 * Selectors are per-store and WILL rot as stores redesign — keep them in
 * this single table. `stores.url_pattern` in the backend DB mirrors the
 * URL detection so server and extension agree on what a "supported store" is.
 */

"use strict";

/** Per-store detection + extraction rules. First match wins. */
const SITE_CONFIGS = [
  {
    slug: "amazon-sa",
    hostPattern: /(^|\.)amazon\.sa$/,
    productPathPattern: /\/(dp|gp\/product)\/[A-Z0-9]{10}/i,
    titleSelectors: ["#productTitle"],
    priceSelectors: [
      "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",
      "#corePrice_feature_div .a-price .a-offscreen",
      ".a-price .a-offscreen",
    ],
  },
  {
    slug: "amazon-ae",
    hostPattern: /(^|\.)amazon\.ae$/,
    productPathPattern: /\/(dp|gp\/product)\/[A-Z0-9]{10}/i,
    titleSelectors: ["#productTitle"],
    priceSelectors: [
      "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",
      ".a-price .a-offscreen",
    ],
  },
  {
    slug: "noon",
    hostPattern: /(^|\.)noon\.com$/,
    productPathPattern: /\/[A-Z0-9]+\/p\/?(\?|$)/i,
    titleSelectors: ["h1[data-qa='pdp-name']", "h1"],
    priceSelectors: [
      "[data-qa='div-price-now']",
      ".priceNow",
    ],
  },
  {
    slug: "namshi",
    hostPattern: /(^|\.)namshi\.com$/,
    productPathPattern: /\/buy-|\/p\//i,
    titleSelectors: ["h1[class*='ProductTitle']", "h1"],
    priceSelectors: ["[class*='ProductPrice'] span", "[class*='price']"],
  },
  {
    slug: "trendyol",
    hostPattern: /(^|\.)trendyol\.com$/,
    productPathPattern: /-p-\d+/i,
    titleSelectors: ["h1.pr-new-br", "h1"],
    priceSelectors: [".prc-dsc", ".prc-slg"],
  },
];

/**
 * Parses a displayed price like "3,499.00 ريال", "AED 1.299,00" or
 * "١٢٣٤٫٥٦" into a float. Handles Arabic-Indic digits and both comma
 * conventions; returns null when no digits are present.
 */
function parseDisplayedPrice(text) {
  if (!text) return null;

  // Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits → ASCII.
  const ascii = text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".") // Arabic decimal separator ٫
    .replace(/٬/g, ","); // Arabic thousands separator ٬

  const match = ascii.match(/\d[\d.,\s]*/);
  if (!match) return null;

  let num = match[0].replace(/\s/g, "");
  const lastComma = num.lastIndexOf(",");
  const lastDot = num.lastIndexOf(".");
  if (lastComma > lastDot) {
    // "1.299,00" style — dots are thousands, comma is decimal.
    num = num.replace(/\./g, "").replace(",", ".");
  } else {
    // "1,299.00" style — commas are thousands.
    num = num.replace(/,/g, "");
  }
  const value = parseFloat(num);
  return Number.isFinite(value) ? value : null;
}

function firstText(selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const text = el && el.textContent && el.textContent.trim();
    if (text) return text;
  }
  return null;
}

function detectSite() {
  const host = location.hostname.replace(/^www\./, "");
  return (
    SITE_CONFIGS.find(
      (c) =>
        c.hostPattern.test(host) &&
        c.productPathPattern.test(location.pathname + location.search)
    ) || null
  );
}

function extractProduct() {
  const site = detectSite();
  if (!site) return null;

  const title = firstText(site.titleSelectors);
  if (!title) return null;

  return {
    store: site.slug,
    title,
    price: parseDisplayedPrice(firstText(site.priceSelectors)),
    url: location.href,
  };
}

/** Send the detected product to the service worker (fire-and-forget). */
function reportProduct() {
  const product = extractProduct();
  if (!product) return;
  try {
    chrome.runtime.sendMessage({ type: "PRODUCT_DETECTED", product });
  } catch {
    /* extension was reloaded; next navigation re-injects us */
  }
}

// Stores are SPAs: extract now, retry shortly after for late-rendered DOM,
// and re-run on history navigation.
reportProduct();
setTimeout(reportProduct, 2500);

let lastHref = location.href;
new MutationObserver(() => {
  if (location.href !== lastHref) {
    lastHref = location.href;
    setTimeout(reportProduct, 1500);
  }
}).observe(document.body, { childList: true, subtree: true });

// The popup asks us directly when opened on a page whose report was missed.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "GET_PRODUCT_INFO") {
    sendResponse({ product: extractProduct() });
  }
  return false;
});
