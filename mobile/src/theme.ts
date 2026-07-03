/**
 * Souqly design tokens. All spacing used through the app is logical
 * (start/end), so components mirror correctly under I18nManager RTL.
 */
export const colors = {
  green: "#0E9F6E",
  greenDark: "#057A55",
  ink: "#1F2A37",
  inkSoft: "#6B7280",
  line: "#E5E7EB",
  bg: "#F9FAFB",
  card: "#FFFFFF",
  gold: "#B45309",
  goldBg: "#FEF3C7",
  danger: "#DC2626",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  pill: 999,
} as const;

/** Arabic currency labels for supported markets. */
export const CURRENCY_AR: Record<string, string> = {
  SAR: "ر.س",
  AED: "د.إ",
  KWD: "د.ك",
  EGP: "ج.م",
};

/** "٣٬٣١٨٫١٩ ر.س" — Arabic-Indic digits with the currency label. */
export function formatPriceAr(amount: number, currency: string): string {
  const label = CURRENCY_AR[currency] ?? currency;
  return `${amount.toLocaleString("ar-SA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${label}`;
}
