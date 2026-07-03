import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { config } from "../config.js";

/**
 * Real Noon search scraping (worker process only, SCRAPER_ENABLED=true).
 *
 * Split in two so the fragile part is testable without a browser:
 *   - `fetchNoonSearchHtml`   — Playwright drives Chromium to the search
 *     page with ar-AE locale and returns the rendered HTML;
 *   - `parseNoonSearchHtml`   — pure HTML → hits parser (cheerio),
 *     unit-tested against a saved fixture.
 *
 * Failure classification matters: BLOCKED (captcha/bot-wall) must never be
 * treated as "no results", or we'd cache an empty answer for 3 hours.
 *
 * PRODUCTION notes: rotate residential proxies, randomize UA within a
 * current-Chrome family, keep per-store concurrency at 1 (worker limiter),
 * and refresh the selector table below when Noon ships a redesign.
 */

export class ScrapeBlockedError extends Error {
  constructor(reason: string) {
    super(`scrape blocked: ${reason}`);
    this.name = "ScrapeBlockedError";
  }
}

export interface NoonScrapedHit {
  sku: string;
  name: string;
  image_key: string | null;
  price: number;
  sale_price: number | null;
  is_buyable: boolean;
}

/**
 * Parse Noon's rendered search page. Selector assumptions (verify against
 * the live site on deployment — Noon redesigns periodically):
 *   - product cards:   [data-qa="product-item"], fallback div[id^="productBox-"]
 *   - product link:    a[href*="/p/"] with the SKU as the path segment before /p
 *   - title:           [data-qa="product-name"], fallback the link's title attr
 *   - current price:   [data-qa="price-now"], fallback .amount
 *   - old (pre-sale):  [data-qa="price-was"], fallback .oldPrice
 */
export function parseNoonSearchHtml(html: string): NoonScrapedHit[] {
  const $ = cheerio.load(html);

  if (isBlockedPage($)) {
    throw new ScrapeBlockedError("captcha / bot verification page detected");
  }

  const cards = $('[data-qa="product-item"], div[id^="productBox-"]');
  const hits: NoonScrapedHit[] = [];

  cards.each((_i, el) => {
    const card = $(el);

    const link = card.find('a[href*="/p/"]').first();
    const href = link.attr("href") ?? "";
    // e.g. /uae-en/apple-iphone-16-.../N70106183V/p/  → SKU = N70106183V
    const skuMatch = href.match(/\/([A-Z0-9]{8,})\/p\/?/i);
    if (!skuMatch) return;

    const name =
      textOf(card, '[data-qa="product-name"]') ??
      link.attr("title")?.trim() ??
      null;
    if (!name) return;

    const priceNow = parseNoonPrice(
      textOf(card, '[data-qa="price-now"]') ?? textOf(card, ".amount")
    );
    if (priceNow === null) return;

    const priceWas = parseNoonPrice(
      textOf(card, '[data-qa="price-was"]') ?? textOf(card, ".oldPrice")
    );

    const img = card.find("img").first().attr("src") ?? null;
    const imageKey = img?.match(/\/p\/([^/.]+)/)?.[1] ?? null;

    const outOfStock =
      card.find('[data-qa="out-of-stock"]').length > 0 ||
      /نفدت الكمية|out of stock/i.test(card.text());

    hits.push({
      sku: skuMatch[1]!.toUpperCase(),
      name,
      image_key: imageKey,
      // When a sale is on, price-now is the sale and price-was the sticker.
      price: priceWas ?? priceNow,
      sale_price: priceWas !== null ? priceNow : null,
      is_buyable: !outOfStock,
    });
  });

  return hits;
}

function isBlockedPage($: cheerio.CheerioAPI): boolean {
  const text = $("body").text().toLowerCase();
  return (
    $('form[action*="validateCaptcha"]').length > 0 ||
    $("#challenge-form, #px-captcha").length > 0 ||
    text.includes("access denied") ||
    text.includes("verify you are a human")
  );
}

function textOf(
  card: cheerio.Cheerio<AnyNode>,
  selector: string
): string | null {
  const t = card.find(selector).first().text().trim();
  return t || null;
}

/** "3,249.00", "AED 3٬249٫00" → 3249.00 */
export function parseNoonPrice(text: string | null): number | null {
  if (!text) return null;
  const ascii = text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/٫/g, ".")
    .replace(/[٬,]/g, "");
  const match = ascii.match(/\d+(\.\d+)?/);
  if (!match) return null;
  const value = parseFloat(match[0]);
  return Number.isFinite(value) ? value : null;
}

/* ------------------------------------------------------------------ */
/* Playwright fetch (worker only)                                      */
/* ------------------------------------------------------------------ */

export async function fetchNoonSearchHtml(
  query: string,
  signal: AbortSignal
): Promise<string> {
  // Lazy import keeps playwright-core out of the API process entirely.
  const { chromium } = await import("playwright-core");

  const browser = await chromium.launch({
    executablePath: config.chromiumPath,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  try {
    const context = await browser.newContext({
      locale: "ar-AE",
      timezoneId: "Asia/Dubai",
      viewport: { width: 1366, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    });

    // Skip heavy assets — we only need the DOM.
    await context.route("**/*", (route) => {
      const type = route.request().resourceType();
      return ["image", "media", "font"].includes(type)
        ? route.abort()
        : route.continue();
    });

    const page = await context.newPage();
    signal.addEventListener("abort", () => void page.close().catch(() => {}), {
      once: true,
    });

    const url = `https://www.noon.com/uae-ar/search/?q=${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    // Product grid hydrates client-side; give it a beat, then take what's there.
    await page
      .waitForSelector('[data-qa="product-item"], div[id^="productBox-"]', {
        timeout: 10_000,
      })
      .catch(() => {}); // parser + block detection decide what happened
    return await page.content();
  } finally {
    await browser.close();
  }
}
