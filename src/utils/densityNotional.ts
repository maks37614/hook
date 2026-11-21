/** Visible USDT order-book level value, not a fill, margin or single trader's order.
 * Exchange depth quantity is in the base asset for supported spot/linear USDT pairs.
 * USDT quote notional is calculated upstream as price × quantity. Formatting never alters
 * that raw value, threshold decisions or the data saved with the event.
 */
export type DensityAmountLanguage = 'uk' | 'en' | 'ru' | 'pl';

const locales: Record<DensityAmountLanguage, string> = {
  uk: 'uk-UA', en: 'en-US', ru: 'ru-RU', pl: 'pl-PL',
};
// Reuse one exact locale formatter per language across Canvas paints.
const exactFormatters = Object.fromEntries(
  Object.entries(locales).map(([language, locale]) => [language,
    new Intl.NumberFormat(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2})]),
) as Record<DensityAmountLanguage, Intl.NumberFormat>;
const formatters = Object.fromEntries(
  Object.entries(locales).map(([key, locale]) =>
    [key, new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })]),
) as Record<DensityAmountLanguage, Intl.NumberFormat>;

export function formatDensityUsdCompact(
  amount: number | undefined | null,
  language: DensityAmountLanguage = 'uk',
): string {
  if (amount === undefined || amount === null || !Number.isFinite(amount) || amount < 0) return '—';
  const format = formatters[language] || formatters.uk;
  const thousands = language === 'en' || language === 'pl' ? 'k$' : 'к$';
  const millions = language === 'en' ? 'm$' : language === 'pl' ? 'mln$' : 'млн$';
  if (amount >= 1_000_000) return `${format.format(amount / 1_000_000)}${millions}`;
  if (amount >= 1_000) return `${format.format(amount / 1_000)}${thousands}`;
  return `${format.format(amount)}$`;
}

/** Full observed notional, rounded only to the nearest cent for display. */
export function formatDensityUsdExact(
  amount: number | undefined | null,
  language: DensityAmountLanguage = 'uk',
): string {
  if (amount === undefined || amount === null || !Number.isFinite(amount) || amount < 0) return '—';
  return `${(exactFormatters[language] || exactFormatters.uk).format(amount)}$`;
}

/** Display historic events using the saved numeric order-book evidence, never
 * reverse-engineer the actual amount from their lossy "$0.01M" text.
 */
export function densityEventAmountText(
  text: string, type: string | undefined, evidence: unknown,
  language: DensityAmountLanguage = 'uk',
  symbol?: string,
): string {
  if (type !== 'DENSITY_APPEARED' && type !== 'DENSITY_PERSISTENT') return text;
  if (!evidence || typeof evidence !== 'object') return text;
  const amount = (evidence as { notionalUsd?: unknown }).notionalUsd;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return text;
  // Only correct legacy abbreviated amounts when verified evidence exists.
  // Symbol metadata determines quote units; the '$293.51' price remains intact.
  const amountText = symbol ? formatDensityLevelCompact(amount, symbol, language) : formatDensityUsdCompact(amount, language);
  if (amountText === '—') return text;
  const compactCorrected = text.replace(/\$\d+(?:\.\d+)?M\b|\d+(?:[.,]\d+)?(?:к|k|млн|mln|m)\$/gi, amountText);
  if (!symbol || !hookChartDensityQuote(symbol)) return compactCorrected;
  const exact = formatDensityLevelExact(amount, symbol, language);
  // Only replace the old exact figure in the two known density-event templates.
  // Never rewrite a '$293.51' quote price or infer a number from historical text.
  return compactCorrected
    .replace(/\(точно\s+[\d\s\u00a0\u202f.,]+\$\)/u, `(точно ${exact})`)
    .replace(/^(Ліквідність\s+)[\d\s\u00a0\u202f.,]+\$(?=\s+за\s+ціною)/u, (_whole, prefix: string) => prefix + exact);
}

/** Chart catalogue currently contains USDT-quoted spot and linear perpetual instruments.
 * Do not infer an inverse contract multiplier or an arbitrary currency from an unknown symbol.
 * A future expanded catalogue must pass verified contract metadata before enabling densities.
 */
export function hookChartDensityQuote(symbol: string): 'USDT' | null {
  const clean = symbol.replace(/[^\p{L}\p{M}\p{N}]/gu, '').toUpperCase();
  return clean.length > 4 && clean.endsWith('USDT') ? 'USDT' : null;
}

/** Explicit quote units, independent of display language; no fiat conversion. */
export function formatHookChartDensityNotional(amount: number, quote: 'USDT' | null, language: DensityAmountLanguage = 'uk'): string {
  if (!quote || !Number.isFinite(amount) || amount < 0) return '—';
  const format = formatters[language] || formatters.uk;
  const scale = amount >= 1e9 ? 1e9 : amount >= 1e6 ? 1e6 : amount >= 1e3 ? 1e3 : 1;
  const suffix = scale === 1e9 ? 'B' : scale === 1e6 ? 'M' : scale === 1e3 ? 'k' : '';
  return format.format(amount / scale) + suffix + ' ' + quote;
}

/** Exact quote notional, rounded for display only. */
export function formatHookChartDensityNotionalExact(amount: number, quote: 'USDT' | null, language: DensityAmountLanguage = 'uk'): string {
  if (!quote || !Number.isFinite(amount) || amount < 0) return '—';
  return (exactFormatters[language] || exactFormatters.uk).format(amount) + ' ' + quote;
}

/** Exchange-level notional with the quote unit derived from the actual instrument. */
export function formatDensityLevelCompact(amount: number, symbol: string, language: DensityAmountLanguage = 'uk'): string {
  return formatHookChartDensityNotional(amount, hookChartDensityQuote(symbol), language);
}
export function formatDensityLevelExact(amount: number, symbol: string, language: DensityAmountLanguage = 'uk'): string {
  return formatHookChartDensityNotionalExact(amount, hookChartDensityQuote(symbol), language);
}
