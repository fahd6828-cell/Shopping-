/**
 * سوقلي — shared extension settings (ES module: imported by the service
 * worker, the popup, and the options page; content scripts receive what
 * they need via messages instead).
 *
 * Stored in chrome.storage.sync so settings roam with the browser profile.
 */

export const DEFAULT_SETTINGS = {
  /** Shopper country — drives currency + shipping in comparisons. */
  country: "SA",
  /** Souqly backend. PRODUCTION: default to the deployed API origin. */
  apiBaseUrl: "http://localhost:3000",
};

export const SUPPORTED_COUNTRIES = [
  { code: "SA", label: "السعودية 🇸🇦" },
  { code: "AE", label: "الإمارات 🇦🇪" },
  { code: "KW", label: "الكويت 🇰🇼" },
  { code: "EG", label: "مصر 🇪🇬" },
];

export async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(settings) {
  const clean = {
    country: SUPPORTED_COUNTRIES.some((c) => c.code === settings.country)
      ? settings.country
      : DEFAULT_SETTINGS.country,
    apiBaseUrl: normalizeBaseUrl(settings.apiBaseUrl),
  };
  await chrome.storage.sync.set(clean);
  return clean;
}

function normalizeBaseUrl(url) {
  const trimmed = (url || "").trim().replace(/\/+$/, "");
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("bad protocol");
    }
    return trimmed;
  } catch {
    return DEFAULT_SETTINGS.apiBaseUrl;
  }
}
