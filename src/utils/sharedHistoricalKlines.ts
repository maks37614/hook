import type { ExchangeId, Kline, MarketType, Timeframe } from '../types';
import { fetchDirectKlines } from './directExchangeClient';
import { candlesBeforeHistoryEnd } from './hookChartHistory';
import { normalizeExchangeSymbol } from './marketSymbols';
import { createTimedRequestCache } from './sharedAnalysisKlines';

// Only PUBLIC exchange candles are shared. No replay, user drawings, alerts,
// authentication headers or account-dependent responses enter these caches.
// Latest bars expire quickly; confirmed older pages remain valid longer.
const latestPages = createTimedRequestCache<Kline[]>(3_000, 32);
const olderPages = createTimedRequestCache<Kline[]>(120_000, 48);

export interface HistoryPageRequest {
  exchange: ExchangeId;
  marketType: MarketType;
  symbol: string;
  timeframe: Timeframe;
  limit: number;
  /** Inclusive exchange-candle end time, in milliseconds. */
  endTime?: number;
}

export function sharedHistoricalKlineKey(request: HistoryPageRequest): string {
  const { exchange, marketType, symbol, timeframe, limit, endTime } = request;
  return [exchange, marketType, normalizeExchangeSymbol(symbol).toUpperCase(), timeframe,
    Math.max(1, Math.min(1000, Math.round(limit))), endTime ?? 'latest'].join(':');
}

async function loadHistoryPage(request: HistoryPageRequest): Promise<Kline[]> {
  const symbol = normalizeExchangeSymbol(request.symbol);
  const limit = Math.max(1, Math.min(1000, Math.round(request.limit)));
  const endTime = request.endTime;
  const params = new URLSearchParams({
    exchange: request.exchange, market: request.marketType, symbol,
    timeframe: request.timeframe, limit: String(limit),
  });
  if (endTime !== undefined) params.set('endTime', String(endTime));
  try {
    const response = await fetch('/api/klines?' + params, {
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error('History endpoint returned ' + response.status);
    const data = await response.json();
    if (!data?.success || !Array.isArray(data.data)) throw new Error('Invalid candle page');
    const rows = data.data as Kline[];
    const accepted = endTime === undefined ? rows : candlesBeforeHistoryEnd(rows, endTime);
    // A single latest candle cannot initialize a chart: preserve the previous
    // direct-exchange fallback instead of caching a broken partial response.
    if (accepted.length > (endTime === undefined ? 1 : 0)) return accepted;
    // An upstream endpoint can return an empty page, or ignore endTime.
    // Fall through to the public exchange API without caching that failure.
  } catch {
    // The public direct fallback is independent of the server's mirror.
  }

  const direct = await fetchDirectKlines(request.exchange, request.marketType, symbol,
    request.timeframe, limit, undefined, endTime);
  return endTime === undefined ? direct : candlesBeforeHistoryEnd(direct, endTime);
}

/** Coalesce identical initial/history-page requests within a browser tab.
 * Failed requests are evicted; cache keys include the full market scope and
 * historical cursor to prevent mixing different symbols or timeframes.
 */
export function fetchSharedHistoricalKlines(request: HistoryPageRequest): Promise<Kline[]> {
  const cache = request.endTime === undefined ? latestPages : olderPages;
  return cache.load(sharedHistoricalKlineKey(request), () => loadHistoryPage(request));
}
