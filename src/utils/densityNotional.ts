/** Visible USDT order-book level value, not a fill, margin or single trader's order.
 * Exchange depth quantity is in the base asset for supported spot/linear USDT pairs.
 * USD notional is calculated upstream as price × quantity. Formatting never alters
 * that raw value, threshold decisions or the data saved with the event.
 */
export type DensityAmountLanguage = 'uk' | 'en' | 'ru' | 'pl';

const locales: Record<DensityAmountLanguage, string> = {
  uk: 'uk-UA', en: 'en-US', ru: 'ru-RU', pl: 'pl-PL',
};
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
  const locale = locales[language] || locales.uk;
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}$`;
}

/** Display historic events using the saved numeric order-book evidence, never
 * reverse-engineer the actual amount from their lossy "$0.01M" text.
 */
export function densityEventAmountText(
  text: string, type: string | undefined, evidence: unknown,
  language: DensityAmountLanguage = 'uk',
): string {
  if (type !== 'DENSITY_APPEARED' && type !== 'DENSITY_PERSISTENT') return text;
  if (!evidence || typeof evidence !== 'object') return text;
  const amount = (evidence as { notionalUsd?: unknown }).notionalUsd;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return text;
  return text.replace(/\$\d+(?:\.\d+)?M\b/gi, formatDensityUsdCompact(amount, language));
}
