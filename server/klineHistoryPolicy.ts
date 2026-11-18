import type { Timeframe } from '../src/types';

/** Live/latest klines must remain fresh; immutable history can be reused.
 * No polling, timers or extra memory allocations beyond the existing capped cache.
 */
export const LIVE_KLINES_TTL_MS = 1_500;
export const HISTORICAL_KLINES_TTL_MS = 15 * 60_000;

const frameMs: Record<Timeframe, number> = {
  '30s': 30_000, '1m': 60_000, '5m': 300_000, '15m': 900_000,
  '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000,
};

/** Only cache fully historical, completed ranges for longer.
 * Excludes requests near current candles and malformed end timestamps.
 * Keeps historical outputs separate from the live/fresh semantics of HookChart.
 */
export function klineCacheTtlMs(timeframe: Timeframe, endTime?: number, now = Date.now()): number {
  if (typeof endTime !== 'number' || !Number.isFinite(endTime) || endTime <= 0 ||
      !Number.isFinite(now)) return LIVE_KLINES_TTL_MS;
  const frame = frameMs[timeframe];
  if (!frame || endTime > now - Math.max(48 * 3_600_000, 2 * frame))
    return LIVE_KLINES_TTL_MS;
  return HISTORICAL_KLINES_TTL_MS;
}
