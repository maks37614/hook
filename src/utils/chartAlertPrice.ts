import { getChartPriceFormat } from './formatters';

/** Numeric HTML inputs need a plain decimal (no commas, currency or exponent). */
export function chartCrosshairAlertPrice(price: number): string | null {
  if (!Number.isFinite(price) || price <= 0) return null;
  const minimumDigits = getChartPriceFormat(price).precision;
  const leadingZeros = price < 1 ? Math.max(0, -Math.floor(Math.log10(price))) : 0;
  const digits = Math.min(14, Math.max(minimumDigits, leadingZeros + 3));
  return price.toFixed(digits);
}
