import type { MarketPrint } from './marketAnalytics';

/** Display-only threshold: preserve the exchange feed and adaptive large-trade detection. */
export function normalizeMarketPrintDisplayMinUsd(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(1_000_000_000_000, Math.round(value * 100) / 100) : 0;
}

export type MarketPrintCandleBucket = {
  index: number;
  t: number;
  buyUsd: number;
  sellUsd: number;
  totalUsd: number;
  buyGroups: number;
  sellGroups: number;
};

/**
 * A single per-candle BUY/SELL summary from real, qualifying market-trade bursts.
 * Do not use nearest-candle snapping: a print belongs to [open, open + interval).
 * Per-second segments keep bursts that cross a candle boundary in the right bars.
 */
export function aggregateMarketPrintsByCandle(
  candles: readonly { t: number }[],
  prints: readonly MarketPrint[],
  intervalMs: number,
): MarketPrintCandleBucket[] {
  if (!candles.length || !prints.length || !Number.isFinite(intervalMs) || intervalMs <= 0) return [];
  const unique = new Map<string, MarketPrint>();
  for (const item of prints) {
    if (!item.id || !Number.isFinite(item.usd) || item.usd <= 0) continue;
    const previous = unique.get(item.id);
    if (!previous || item.usd >= previous.usd) unique.set(item.id, item);
  }
  const buckets = new Map<number, MarketPrintCandleBucket>();
  const indexAt = (time: number) => {
    let low = 0, high = candles.length - 1, index = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (candles[mid].t <= time) { index = mid; low = mid + 1; }
      else high = mid - 1;
    }
    return index;
  };
  for (const item of unique.values()) {
    const segments = item.segments?.length ? item.segments : [{ t: item.t, usd: item.usd }];
    const counted = new Set<number>();
    for (const segment of segments) {
      if (!Number.isFinite(segment.t) || !Number.isFinite(segment.usd) || segment.usd <= 0) continue;
      const index = indexAt(segment.t), candle = candles[index];
      if (!candle || segment.t < candle.t || segment.t >= candle.t + intervalMs) continue;
      const bucket = buckets.get(index) || {
        index, t: candle.t, buyUsd: 0, sellUsd: 0, totalUsd: 0, buyGroups: 0, sellGroups: 0,
      };
      if (item.side === 'BUY') {
        bucket.buyUsd += segment.usd;
        if (!counted.has(index)) bucket.buyGroups++;
      } else {
        bucket.sellUsd += segment.usd;
        if (!counted.has(index)) bucket.sellGroups++;
      }
      counted.add(index);
      bucket.totalUsd += segment.usd;
      buckets.set(index, bucket);
    }
  }
  return [...buckets.values()].sort((a, b) => a.index - b.index);
}

/** Avoid reprocessing prints when only the visible minimum is changed. */
export function filterMarketPrintCandleBuckets(
  buckets: readonly MarketPrintCandleBucket[],
  minUsd: number,
): readonly MarketPrintCandleBucket[] {
  const minimum = normalizeMarketPrintDisplayMinUsd(minUsd);
  return minimum <= 0 ? buckets : buckets.filter(bucket => bucket.totalUsd >= minimum);
}
