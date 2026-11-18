import type { ExchangeId, MarketType, Timeframe } from '../types';
import { timeframeToMs } from './replayService';

const boundaries = new Map<string, { value: number | null; until: number }>();
const pending = new Map<string, Promise<number | null>>();

/** One shared, read-only server lookup per instrument, never per chart frame. */
export function fetchReplayHistoryBoundary(
  exchange: ExchangeId, market: MarketType, symbol: string,
): Promise<number | null> {
  const key = [exchange, market, symbol.toUpperCase()].join(':');
  const cached = boundaries.get(key);
  if (cached && cached.until > Date.now()) return Promise.resolve(cached.value);
  const running = pending.get(key);
  if (running) return running;
  const work = (async () => {
    let first: number | null = null;
    try {
      const params = new URLSearchParams({ exchange, market, symbol });
      const res = await fetch('/api/replay/history-bounds?' + params, {
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.success && Number.isFinite(json.firstCandleMs) &&
            json.firstCandleMs > Date.UTC(2010, 0, 1) &&
            json.firstCandleMs < Date.now()) first = json.firstCandleMs;
      }
    } catch {
      // If the lookup is unavailable, Replay can still attempt real candles.
    }
    boundaries.delete(key);
    boundaries.set(key, { value: first, until: Date.now() + (first ? 20 * 60_000 : 60_000) });
    while (boundaries.size > 100) boundaries.delete(boundaries.keys().next().value!);
    return first;
  })();
  pending.set(key, work);
  void work.finally(() => {
    if (pending.get(key) === work) pending.delete(key);
  }).catch(() => {});
  return work;
}

export function resolveReplayHistoryDate(
  requested: Date,
  firstCandleMs: number | null,
  timeframe: Timeframe,
  randomSelection: boolean,
  now = Date.now(),
  random: () => number = Math.random,
): { date: Date; adjusted: boolean } {
  if (!firstCandleMs || !Number.isFinite(firstCandleMs) ||
      firstCandleMs > now || Number.isNaN(requested.getTime()))
    return { date: requested, adjusted: false };

  const timeframeMs = timeframeToMs(timeframe);
  const dayMs = 86_400_000;
  // Prefer a little lead-in after listing, without requiring 280 daily bars
  // from a contract that has existed for only a few weeks.
  const latestUsable = Math.max(firstCandleMs, now - Math.max(2 * timeframeMs, dayMs));
  const bufferedStart = Math.max(firstCandleMs,
    Math.min(firstCandleMs + Math.min(280 * timeframeMs, 14 * dayMs), latestUsable));

  if (randomSelection) {
    const earliest = Math.min(latestUsable, Math.max(now - 500 * dayMs, bufferedStart));
    const latest = Math.max(earliest, Math.min(latestUsable, now - 30 * dayMs));
    const chosen = earliest + Math.max(0, Math.min(1, random())) * (latest - earliest);
    const result = new Date(chosen);
    result.setMinutes(0, 0, 0);
    // Rounding down to the hour must not predate the first trade.
    if (result.getTime() < firstCandleMs) return { date: new Date(bufferedStart), adjusted: true };
    return { date: result, adjusted: result.getTime() !== requested.getTime() };
  }
  if (requested.getTime() < firstCandleMs)
    return { date: new Date(bufferedStart), adjusted: true };
  return { date: requested, adjusted: false };
}
