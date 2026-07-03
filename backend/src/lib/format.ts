/** Arabic currency labels for the supported markets. */
export const CURRENCY_AR: Record<string, string> = {
  SAR: "ر.س",
  AED: "د.إ",
  KWD: "د.ك",
  EGP: "ج.م",
};

/** "٣٬٢٤٩ ر.س" — Arabic-Indic digits with the Arabic currency label. */
export function formatPriceAr(amount: number, currency: string): string {
  const label = CURRENCY_AR[currency] ?? currency;
  return `${amount.toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ${label}`;
}
