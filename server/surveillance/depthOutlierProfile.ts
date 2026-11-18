import { lowerQuantile } from './lowerMedian';

export interface DepthSideProfile {
  count: number;
  median: number;
  p90: number;
  p99: number;
}
export interface DepthOutlierProfile {
  count: number;
  median: number;
  p90: number;
  p99: number;
  bid: DepthSideProfile;
  ask: DepthSideProfile;
}

function side(values: number[]): DepthSideProfile {
  if (!values.length) return { count: 0, median: 0, p90: 0, p99: 0 };
  // Order-statistic selection on a throwaway list avoids n log n sorting
  // at 1000 levels per side / 200ms WebSocket updates.
  const median = lowerQuantile(values, 0.5);
  const p90 = lowerQuantile(values, 0.90);
  const p99 = lowerQuantile(values, 0.99);
  return { count: values.length, median, p90, p99 };
}

export function depthOutlierProfile(
  bids: ReadonlyMap<number, number>, asks: ReadonlyMap<number, number>,
): DepthOutlierProfile | null {
  const bidValues: number[] = [];
  const askValues: number[] = [];
  for (const [price, qty] of bids) {
    const notional = price * qty;
    if (price > 0 && qty > 0 && Number.isFinite(notional)) bidValues.push(notional);
  }
  for (const [price, qty] of asks) {
    const notional = price * qty;
    if (price > 0 && qty > 0 && Number.isFinite(notional)) askValues.push(notional);
  }
  if (!bidValues.length || !askValues.length) return null;
  const pooled = side([...bidValues, ...askValues]);
  const bid = side(bidValues), ask = side(askValues);
  return { ...pooled, bid, ask };
}

/** Deliberately conservative AUTO policy. This is an outlier detector, not
 * a prediction that price will react to the displayed liquidity.
 *
 * - A sublinear 24h-turnover floor scales from thin alts to BTC/ETH without
 *   imposing an unrealistic linear fraction of very large exchange turnover.
 *   The policy is a conservative heuristic, not a guarantee of reaction.
 * - Upper order-book quantiles require an exceptional price level, rather
 *   than merely 5x a tiny median.
 * - Separate BID/ASK tails keep typical size differences from hiding a wall.
 * - If ticker turnover is unavailable, fail closed at >=$1m until refreshed.
 * - Sample-size guards avoid treating a 4-level toy book's max as p99.
 */
export function densityOutlierThresholds(profile: DepthOutlierProfile | null, turnover24hUsd: number,
  manualThresholdUsd: number, mode: 'AUTO' | 'MANUAL' | 'HYBRID',
): { common: number; bid: number; ask: number } {
  if (mode === 'MANUAL') return { common: manualThresholdUsd, bid: manualThresholdUsd, ask: manualThresholdUsd };
  if (!profile) {
    // No synchronized two-sided DOM = no legitimate AUTO detection. Keep the
    // safety fallback independent from the (hidden) manual setting in AUTO.
    const unavailable = mode === 'HYBRID' ? Math.max(manualThresholdUsd, 1_000_000) : 1_000_000;
    return { common: unavailable, bid: unavailable, ask: unavailable };
  }
  // Calibrate from turnover of this *exact exchange/market/symbol*, never
  // from a symbol name, price per coin or a fixed BTC/ETH allowlist.
  // $5m daily turnover -> $25k floor, $10m -> $30k, $1bn -> ~$378k,
  // $8bn -> ~$1.18m. A $50k wall can be exceptional on a thin alt
  // while the same size (or $500k) is ordinary on a major market.
  const activityFloor = Number.isFinite(turnover24hUsd) && turnover24hUsd > 0
    ? Math.max(25_000, 30_000 * Math.pow(turnover24hUsd / 10_000_000, 0.55))
    : 1_000_000;
  // p99 is an upper-rank reference, not a strict greater-than-max test:
  // a cluster of equally large top-1% levels may still be truly exceptional.
  // Compare each side against its own price-level distribution: a strong
  // ASK should not disappear just because typical BID sizes are much larger.
  const sideThreshold = (p: DepthSideProfile) => Math.max(activityFloor,
    p.median * 4, p.count >= 30 ? Math.max(p.p90 * 1.75, p.p99 * 0.95) : 0);
  const bidAuto = sideThreshold(profile.bid), askAuto = sideThreshold(profile.ask);
  const autoBase = Math.min(bidAuto, askAuto);
  if (mode === 'HYBRID') return {
    common: Math.max(autoBase, manualThresholdUsd),
    bid: Math.max(bidAuto, manualThresholdUsd),
    ask: Math.max(askAuto, manualThresholdUsd),
  };
  return { common: autoBase, bid: bidAuto, ask: askAuto };
}
