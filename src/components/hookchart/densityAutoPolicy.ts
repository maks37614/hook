/** Pure chart-only AUTO liquidity policy. Numeric values are quote notionals;
 * on supported Binance/Bybit instruments this is USDT. Never creates API work.
 */
const finitePositive = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;

/** Anchor in the robust local book. Optional 24h quote turnover is a capped
 * sanity floor, not a fixed nominal threshold or an assumption of full depth.
 */
export function autoDensityBaseCut(
  typicalBookCut: number, multiplier = 1, volume24hQuote?: number | null, spreadPct?: number,
): number {
  if (!(finitePositive(typicalBookCut) > 0)) return 0;
  const factor = Number.isFinite(multiplier) ? Math.max(.1, Math.min(10, multiplier)) : 1;
  const bookFloor = typicalBookCut * factor;
  const daily = finitePositive(volume24hQuote);
  // 0.008% of 24h quote turnover; at most 5x the current book anchor.
  const volumeFloor = daily ? Math.min(bookFloor * 5, daily * .00008) : 0;
  // Wide spreads signal a less representative and potentially sparse book.
  const spread = finitePositive(spreadPct);
  const spreadFactor = 1 + Math.min(.4, Math.max(0, spread - .2) * .25);
  return Math.max(1, Math.ceil(Math.max(bookFloor, volumeFloor) * spreadFactor));
}

/** Opposing executions confirm urgency; never hard-require 50% of 5m trades.
 * Cap at 2.5x the book-informed floor to prevent post-impulse blindness.
 */
export function autoDensitySideCuts(base: number, buy5m: number, sell5m: number): {bidCut:number;askCut:number} {
  if (!(finitePositive(base) > 0)) return {bidCut:0,askCut:0};
  const cut = (flow: number) => Math.max(base, Math.ceil(Math.min(base * 2.5, finitePositive(flow) * .08)));
  return {bidCut:cut(sell5m),askCut:cut(buy5m)};
}

/** A genuine exceptional wall must not disappear solely because several
 * other, independently priced large walls stand in the same nearby cluster.
 */
export function passesAutoLocalLiquidity(usd: number, sideCut: number, localFloor: number): boolean {
  if (!(finitePositive(sideCut) > 0) || !(finitePositive(usd) >= sideCut)) return false;
  return usd >= Math.max(0,localFloor) || usd >= sideCut * 2.5;
}
