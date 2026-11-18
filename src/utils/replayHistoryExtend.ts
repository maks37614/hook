import type { Kline, Timeframe } from '../types';

const SECONDS: Partial<Record<Timeframe, number>> = {
  '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400,
};

/**
 * Prepend only a continuous, earlier, confirmed historical prefix.
 * Never replace the selected replay candles or append future candles.
 * Returned 'added' is the exact offset for cutoffIndex/currentIndex.
 */
export function prependCachedReplayHistory(
  current: readonly Kline[],
  candidates: readonly Kline[],
  timeframe: Timeframe,
): { candles: Kline[]; added: number } {
  const step = SECONDS[timeframe];
  if (!current.length || !step || !candidates.length) return { candles: [...current], added: 0 };
  const firstTime = current[0].time;
  const byTime = new Map<number, Kline>();
  for (const bar of candidates) {
    if (Number.isSafeInteger(bar.time) && bar.time > 0 && bar.time < firstTime) {
      byTime.set(bar.time, bar);
    }
  }
  const prefix: Kline[] = [];
  for (let time = firstTime - step; prefix.length < 1800; time -= step) {
    const bar = byTime.get(time);
    if (!bar) break; // Do not fabricate a candle across a hole or listing boundary.
    prefix.push(bar);
  }
  if (!prefix.length) return { candles: [...current], added: 0 };
  prefix.reverse();
  return { candles: [...prefix, ...current], added: prefix.length };
}

/**
 * Cached older history is a chart-only view, never part of the simulator's
 * candle progression. Collapsing History immediately restores the small
 * replay series without changing currentIndex, cutoffIndex, or future masking.
 */
export function replayVisibleCandles(
  replayCandles: readonly Kline[],
  currentIndex: number,
  historyExpanded: boolean,
  cachedPrefix: readonly Kline[],
): Kline[] {
  if (!replayCandles.length) return [];
  const visible = replayCandles.slice(0, Math.max(0, currentIndex + 1));
  if (!visible.length || !historyExpanded || !cachedPrefix.length) return visible;
  return [...cachedPrefix, ...visible];
}
