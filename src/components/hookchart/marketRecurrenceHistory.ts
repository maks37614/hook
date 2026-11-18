import type { ExchangeId, MarketType, Kline, Timeframe } from '../../types';
import type { RecurrenceBar } from './marketRecurrence';
import { expectedRecurrenceBars, recurrenceBaseTimeframe } from './marketRecurrence';
import { fetchSharedHistoricalKlines, type HistoryPageRequest } from '../../utils/sharedHistoricalKlines';
import { normalizeExchangeSymbol } from '../../utils/marketSymbols';
import { recordRecurrenceHistoryPage, recordRecurrenceHistoryReuse, recordRecurrenceHistoryCancel } from './chartDiagnostics';

const MS: Record<string, number> = {
  '5m': 300_000, '15m': 900_000, '30m': 1_800_000,
  '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000,
};
const WEEK = 7 * 86_400_000;
// Two recent generations for a large Terminal workspace (up to ~36 chart scopes).
const MAX_CACHE = 80;
const MAX_HISTORY_PAGES = 4;

function fromKline(k: Kline): RecurrenceBar {
  return { t: k.time * 1000, o: k.open, h: k.high, l: k.low, c: k.close, v: k.volume };
}
function cancelledError(): Error {
  const error = new Error('Recurrence history no longer requested');
  error.name = 'AbortError';
  return error;
}
export type RecurrenceHistoryRequest = {
  exchange: ExchangeId;
  marketType: MarketType;
  symbol: string;
  chartTimeframe: string;
  existing: readonly RecurrenceBar[];
  nowMs: number;
  /** Cancels just this chart's interest; shared loads survive while needed by other charts. */
  signal?: AbortSignal;
};
type HistoryEntry = {
  key: string;
  promise: Promise<RecurrenceBar[]>;
  users: number;
  settled: boolean;
  rows?: RecurrenceBar[];
};

/**
 * Only an unbroken, recently completed set of bars is safe to roll forward.
 * A previous result with >=85% of 7 days can still contain a large hole or a
 * stale last candle; refetching just 3 latest candles cannot repair those.
 */
export function reusableRecurrenceHistory(
  rows: readonly RecurrenceBar[] | undefined,
  timeframeMs: number,
  expectedLastMs: number,
): rows is readonly RecurrenceBar[] {
  if (!rows?.length || !Number.isFinite(timeframeMs) || timeframeMs <= 0 ||
      rows.length < expectedRecurrenceBars(timeframeMs) * .85 ||
      rows[rows.length - 1].t !== expectedLastMs) return false;
  for (let index = 1; index < rows.length; index++)
    if (rows[index].t - rows[index - 1].t !== timeframeMs) return false;
  return true;
}


/**
 * One loader per browser tab. The optional fetcher makes cancellation,
 * caching and paginated-history behavior testable without an exchange.
 *
 * A shared API request already in flight may finish when the last chart turns
 * off, but no subsequent history page will be requested. This avoids wasting
 * REST capacity when a Terminal switches coins or closes many charts.
 */
export function createMarketRecurrenceHistoryLoader(
  fetchPage: (request: HistoryPageRequest) => Promise<Kline[]> = fetchSharedHistoricalKlines,
) {
  const cache = new Map<string, HistoryEntry>();
  let running = 0;
  const waiters: Array<() => void> = [];

  /**
   * At most two in-flight history pages across all chart scopes in this tab.
   * A released slot is *reserved* for the next waiter before it resumes.
   * Otherwise a new arrival could race ahead and exceed the bound.
   */
  async function queued<T>(action: () => Promise<T>, needed: () => boolean): Promise<T> {
    if (running < 2) running++;
    else await new Promise<void>(resolve => waiters.push(resolve));
    try {
      if (!needed()) throw cancelledError();
      return await action();
    } finally {
      const next = waiters.shift();
      if (next) next(); // Ownership is transferred; running stays unchanged.
      else running--;
    }
  }

  function subscribe(entry: HistoryEntry, signal?: AbortSignal): Promise<RecurrenceBar[]> {
    if (signal?.aborted) return Promise.reject(cancelledError());
    entry.users++;
    return new Promise<RecurrenceBar[]>((resolve, reject) => {
      let finished = false;
      const settle = (result: { rows: RecurrenceBar[] } | { error: unknown }) => {
        if (finished) return;
        finished = true;
        signal?.removeEventListener('abort', onAbort);
        entry.users = Math.max(0, entry.users - 1);
        // A later subscriber must not reuse a partially abandoned fetch.
        if (!entry.users && !entry.settled && cache.get(entry.key) === entry)
          cache.delete(entry.key);
        if ('rows' in result) resolve(result.rows);
        else reject(result.error);
      };
      const onAbort = () => { recordRecurrenceHistoryCancel(); settle({ error: cancelledError() }); };
      signal?.addEventListener('abort', onAbort, { once: true });
      // The signal may have been aborted after the initial check.
      if (signal?.aborted) onAbort();
      entry.promise.then(rows => settle({ rows }), error => settle({ error }));
    });
  }

  return function loadMarketRecurrenceHistory(request: RecurrenceHistoryRequest): Promise<RecurrenceBar[]> {
    const baseTf = recurrenceBaseTimeframe(request.chartTimeframe);
    const timeframeMs = MS[baseTf];
    if (!timeframeMs || !Number.isFinite(request.nowMs)) return Promise.resolve([]);
    if (request.signal?.aborted) return Promise.reject(cancelledError());
    const symbol = normalizeExchangeSymbol(request.symbol).toUpperCase();
    const bucket = Math.floor(request.nowMs / timeframeMs);
    const key = [request.exchange, request.marketType, symbol, baseTf, bucket].join(':');
    const cached = cache.get(key);
    if (cached) {
      recordRecurrenceHistoryReuse();
      // Most recently used scopes survive an eviction when the user switches charts.
      cache.delete(key);
      cache.set(key, cached);
      return subscribe(cached, request.signal);
    }
    const previousKey = [request.exchange, request.marketType, symbol, baseTf, bucket - 1].join(':');
    const previous = cache.get(previousKey);
    // A finished seven-day scan is reusable when the next 5m candle closes.
    // In this case we need only the newest 2-3 bars, not 3 x 1000 pages.
    const previousRows = previous?.settled ? previous.rows : undefined;
    const rollover = reusableRecurrenceHistory(
      previousRows, timeframeMs, bucket * timeframeMs - 2 * timeframeMs,
    ) ? previousRows! : null;
    if (rollover) recordRecurrenceHistoryReuse();

    const entry: HistoryEntry = {
      key, promise: Promise.resolve([]), users: 0, settled: false,
    };
    // Defer the first request until subscribe() has incremented entry.users.
    entry.promise = Promise.resolve().then(async () => {
      const cutoff = request.nowMs - WEEK;
      const currentOpen = bucket * timeframeMs;
      const history = new Map<number, RecurrenceBar>();
      const insert = (bar: RecurrenceBar) => {
        if (Number.isFinite(bar.t) && bar.t >= cutoff && bar.t < currentOpen &&
            Number.isFinite(bar.o) && Number.isFinite(bar.h) &&
            Number.isFinite(bar.l) && Number.isFinite(bar.c) &&
            Number.isFinite(bar.v) && bar.o > 0 && bar.v >= 0) history.set(bar.t, bar);
      };
      if (rollover) for (const bar of rollover) insert(bar);
      if (baseTf === request.chartTimeframe) {
        const existing = request.existing
          .filter(bar => Number.isFinite(bar.t) && bar.t >= cutoff && bar.t < currentOpen)
          .sort((a, b) => a.t - b.t);
        const newest = existing.at(-1)?.t ?? -Infinity;
        if (newest >= currentOpen - 2 * timeframeMs) {
          // Keep only the latest *contiguous* history suffix. Older segments
          // separated by a disconnected feed cannot be stitched to the
          // latest exchange page just by fetching before the oldest bar.
          let first = existing.length - 1;
          while (first > 0 && existing[first].t - existing[first - 1].t === timeframeMs)
            first--;
          for (let i = first; i < existing.length; i++) insert(existing[i]);
        }
      }

      const fetch = (limit: number, endTime?: number) =>
        queued(() => {
          recordRecurrenceHistoryPage();
          return fetchPage({
            exchange: request.exchange, marketType: request.marketType,
            symbol, timeframe: baseTf as Timeframe, limit, endTime,
          });
        }, () => entry.users > 0);

      // Refresh missing latest closed candles. During a normal 5m rollover,
      // carry over the prior seven-day series and fetch just the latest 3 bars.
      // New scopes (or incomplete prior history) still fetch a full latest page.
      const newest = history.size ? Math.max(...history.keys()) : -Infinity;
      if (newest < currentOpen - timeframeMs) {
        const limit = rollover || newest >= currentOpen - 2 * timeframeMs
          ? 3 : Math.min(1000, expectedRecurrenceBars(timeframeMs));
        const latest = await fetch(limit);
        for (const k of latest) insert(fromKline(k));
      }

      let page = 0;
      let oldest = history.size ? Math.min(...history.keys()) : Infinity;
      while (entry.users > 0 && Number.isFinite(oldest) && oldest - cutoff >= timeframeMs &&
          history.size < expectedRecurrenceBars(timeframeMs) && page++ < MAX_HISTORY_PAGES) {
        const before = oldest;
        const remaining = Math.min(1000, expectedRecurrenceBars(timeframeMs) - history.size);
        const rows = await fetch(remaining, before - 1);
        for (const k of rows) {
          const bar = fromKline(k);
          if (bar.t < before) insert(bar);
        }
        oldest = Math.min(...history.keys());
        if (!Number.isFinite(oldest) || oldest >= before) break;
      }
      return [...history.values()].sort((a, b) => a.t - b.t);
    });
    cache.set(key, entry);
    // Evict completed oldest scopes before active scopes. A very large Terminal
    // workspace may still evict an in-flight key; its existing subscribers are safe.
    while (cache.size > MAX_CACHE) {
      const idle = [...cache.entries()].find(([, value]) => !value.users);
      cache.delete((idle || cache.entries().next().value!) [0]);
    }
    void entry.promise.then(
      rows => { entry.rows = rows; entry.settled = true; },
      () => { entry.settled = true; if (cache.get(key) === entry) cache.delete(key); },
    );
    return subscribe(entry, request.signal);
  };
}

export const loadMarketRecurrenceHistory = createMarketRecurrenceHistoryLoader();

export function marketRecurrenceTimeframeMs(tf: string): number {
  return MS[recurrenceBaseTimeframe(tf)] || 0;
}
