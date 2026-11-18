import type { Kline } from '../types';
import { validCandle } from './hookchartData';

export const ARCHIVE_HISTORY_MAX_CANDLES = 5000;

/** Merge two PUBLIC exchange OHLCV pages; current bars always win over older
 * history on duplicate timestamps. Scope must be checked by the caller before
 * committing the result (user, exchange, market, symbol and timeframe). */
export function mergeArchivedHistory(
  current: readonly Kline[], older: readonly Kline[],
  maxCandles = ARCHIVE_HISTORY_MAX_CANDLES,
): Kline[] {
  const accepted = new Map<number, Kline>();
  for (const row of older) if (validCandle(row)) accepted.set(row.time, row);
  for (const row of current) if (validCandle(row)) accepted.set(row.time, row);
  return [...accepted.values()]
    .sort((a, b) => a.time - b.time)
    .slice(-Math.max(1, Math.min(ARCHIVE_HISTORY_MAX_CANDLES, Math.floor(maxCandles))));
}

/** Never fetch pages that cannot fit in the bounded chart history. */
export function archiveHistoryPageLimit(currentCount: number): number {
  return Math.max(0, Math.min(500, ARCHIVE_HISTORY_MAX_CANDLES - currentCount));
}
