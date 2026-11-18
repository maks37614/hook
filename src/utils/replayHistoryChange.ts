import type { Kline } from '../types';

export type ReplayHistoryChange = 'reset' | 'append' | 'replace-last' | 'same';

/**
 * Historical Replay only. Decide whether a chart may use LightweightCharts
 * incremental .update() instead of replacing the entire candle history.
 * Comparing array element identities is cheap and, unlike a timestamp-only
 * shortcut, guarantees that the immutable prefix is really unchanged.
 * Rewind, changed history, another date/coin or a gap must reset everything.
 */
export function replayHistoryChange(
  previous: readonly Kline[] | null,
  next: readonly Kline[],
): ReplayHistoryChange {
  if (!previous || !previous.length || !next.length) return 'reset';
  if (previous === next) return 'same';
  if (next.length === previous.length + 1) {
    for (let i = 0; i < previous.length; i++) {
      if (previous[i] !== next[i]) return 'reset';
    }
    return next.at(-1)!.time > previous.at(-1)!.time ? 'append' : 'reset';
  }
  if (next.length === previous.length) {
    for (let i = 0; i < previous.length - 1; i++) {
      if (previous[i] !== next[i]) return 'reset';
    }
    const last = previous.at(-1)!, current = next.at(-1)!;
    if (last === current) return 'same';
    return last.time === current.time ? 'replace-last' : 'reset';
  }
  return 'reset';
}
