/** Rebuild a dual-exchange OI response after repricing the Binance coin
 * quantity with the CURRENT requesting chart's quote.
 * Bybit supplies its own exchange-confirmed USD openInterestValue.
 */
export interface OiUsdSnapshot { valueUsd: number }
export interface DualOiUsdPair<T extends OiUsdSnapshot> {
  binance: T | null;
  bybit: T | null;
  totalOIUsd: number;
}

export function withRepricedBinanceInPair<T extends OiUsdSnapshot>(
  original: DualOiUsdPair<T>,
  repricedBinance: T | null,
): DualOiUsdPair<T> {
  const valid = (item: T | null): item is T =>
    !!item && Number.isFinite(item.valueUsd) && item.valueUsd > 0;
  const binance = valid(repricedBinance) ? repricedBinance : null;
  const bybit = valid(original.bybit) ? original.bybit : null;
  return {
    binance,
    bybit,
    totalOIUsd: (binance?.valueUsd ?? 0) + (bybit?.valueUsd ?? 0),
  };
}

/** A requesting chart's last price is valid only for the exact SAME contract.
 * For aliases such as PEPEUSDT vs 1000PEPEUSDT, the Binance quote feed must
 * supply the matching contract's price instead (or OI USD is unavailable).
 */
export function oiRequestPriceForResolvedSymbol(
  requestedSymbol: string, resolvedSymbol: string, currentPrice?: number,
): number | undefined {
  const clean = (symbol: string) => symbol.trim().toUpperCase().replace(/[-_:/]/g, '');
  return clean(requestedSymbol) === clean(resolvedSymbol) &&
    typeof currentPrice === 'number' && Number.isFinite(currentPrice) && currentPrice > 0
    ? currentPrice : undefined;
}
