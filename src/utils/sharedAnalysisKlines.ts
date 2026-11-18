import type { ExchangeId, Kline, MarketType, Timeframe } from '../types';
import { fetchDirectKlines } from './directExchangeClient';
import { normalizeExchangeSymbol } from './marketSymbols';

/**
 * Per-tab coalescing for remote analysis candles: multiple HookCharts can show
 * the same coin/timeframe without each creating an identical exchange request.
 * Failed requests are never cached; the cache contains no user data.
 */
export function createTimedRequestCache<T>(ttlMs: number, limit = 128, now = () => Date.now()) {
  // A pending flight must remain reusable regardless of elapsed cache TTL.
  // Successful results get their full TTL from completion, not from dispatch.
  const entries = new Map<string, { expires: number; pending: boolean; task: Promise<T> }>();
  return {
    load(key: string, loader: () => Promise<T>): Promise<T> {
      const cached = entries.get(key);
      if (cached && (cached.pending || cached.expires > now())) return cached.task;
      if (cached) entries.delete(key);

      const task = Promise.resolve().then(loader);
      const entry = { expires: 0, pending: true, task };
      entries.set(key, entry);
      while (entries.size > limit) entries.delete(entries.keys().next().value!);
      // Use both fulfillment/rejection handlers instead of floating finally:
      // a failed request must be retried, and callbacks must not recreate
      // entries removed by clear() or capacity eviction.
      void task.then(() => {
        if (entries.get(key) === entry) {
          entry.pending = false;
          entry.expires = now() + ttlMs;
        }
      }, () => {
        if (entries.get(key) === entry) entries.delete(key);
      });
      return task;
    },
    clear(): void { entries.clear(); },
    get size(): number { return entries.size; },
  };
}

// Keep multi-chart memory usage bounded on mobile (up to 48 unique series).
const analysisCache = createTimedRequestCache<Kline[]>(45_000, 48);

export function fetchSharedAnalysisKlines(
  exchange: ExchangeId,
  marketType: MarketType,
  symbol: string,
  timeframe: Timeframe | '30m',
  limit: number,
): Promise<Kline[]> {
  const normalizedSymbol = normalizeExchangeSymbol(symbol);
  const key = [exchange, marketType, normalizedSymbol, timeframe, limit].join(':');
  return analysisCache.load(key, () => fetchDirectKlines(exchange, marketType, normalizedSymbol, timeframe, limit));
}
