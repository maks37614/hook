import type { Kline } from '../types';
/** Chart-only user preference, never used to change strategy scans. */
export const HOOKCHART_HISTORY_MAX = 5000;
export function clampHookChartHistory(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(100, Math.min(HOOKCHART_HISTORY_MAX, Math.round(count))) : 1000;
}

/** Never reuse a previous instrument's older bars when a chart instance changes
 * symbol, market, exchange, or timeframe. */
export interface ScopedHookChartHistory {
  scope: string;
  rows: Kline[];
}
export function scopedHookChartHistoryRows(history: ScopedHookChartHistory, scope: string): Kline[] {
  return history.scope === scope ? history.rows : [];
}

/** Discard a mirror response that ignored the requested historical end time.
 * Kline timestamps are seconds; request endTime is milliseconds. */
export function candlesBeforeHistoryEnd(rows: Kline[], endTimeMs: number): Kline[] {
  return rows.filter(row => Number.isFinite(row.time) && row.time > 0 && row.time * 1000 <= endTimeMs);
}

/** Append pages requested by the Terminal user without dropping the
 * previously loaded intermediate bars. The cursor only filters NEW rows.
 * Returned rows are bounded, sorted and deduplicated by exchange bar time.
 */
export function mergeTerminalOlderHistory(
  current: readonly Kline[], fetched: readonly Kline[], endTimeMs: number, maxCount: number,
): Kline[] {
  const max = Math.max(0, Math.floor(maxCount));
  if (max === 0) return [];
  const byTime = new Map<number, Kline>();
  for (const row of current) {
    if (Number.isFinite(row.time) && row.time > 0) byTime.set(row.time, row);
  }
  for (const row of fetched) {
    if (Number.isFinite(row.time) && row.time > 0 && row.time * 1000 <= endTimeMs) {
      byTime.set(row.time, row);
    }
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time).slice(-max);
}

/** Page backwards using millisecond endTime; returned candle.time is in seconds. */
export async function extendHookChartHistory(
  original: Kline[],
  requested: number,
  fetchOlder: (endTimeMs: number, limit: number) => Promise<Kline[]>,
  onProgress?: (rows: Kline[]) => void,
  signal?: AbortSignal,
): Promise<Kline[]> {
  const max = clampHookChartHistory(requested);
  const data = new Map<number, Kline>();
  for (const bar of original) if (Number.isFinite(bar.time)) data.set(bar.time, bar);
  let oldest = Math.min(...data.keys());
  if (!Number.isFinite(oldest)) return [];
  // Exchanges cap each request at 1000 candles and sometimes return fewer.
  // Keep paging while the oldest timestamp moves; a short page by itself does
  // not mean there are no older candles.
  const maxPages = Math.min(30, Math.max(6, Math.ceil(max / 250) + 2));
  for (let request = 0; request < maxPages && data.size < max && !signal?.aborted; request++) {
    const count = Math.min(1000, max - data.size);
    const endTime = Math.round(oldest * 1000) - 1;
    const page = await fetchOlder(endTime, count);
    if (signal?.aborted) break;
    const earlier = page.filter(bar => Number.isFinite(bar.time) && bar.time > 0 && bar.time < oldest);
    if (!earlier.length) break;
    for (const bar of earlier) data.set(bar.time, bar);
    const nextOldest = Math.min(...earlier.map(bar => bar.time));
    if (nextOldest >= oldest) break;
    oldest = nextOldest;
    // Expose each completed page; do not discard the successfully fetched
    // candles when a later exchange request fails.
    onProgress?.([...data.values()].sort((a,b) => a.time - b.time).slice(-max));
  }
  return [...data.values()].sort((a,b) => a.time - b.time).slice(-max);
}
