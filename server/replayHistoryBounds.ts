import type { ExchangeId, MarketType } from '../src/types';
import { chartExchangeFetch } from './exchangeHttp';
import { fetchKlines } from './marketService';

// Public listing boundaries are identical for every user. Resolve only on demand;
// share in-flight lookups and cache both successes and short-lived failures.
// No background polling, database rows, or per-user exchange subscriptions.
const positiveTtlMs = 12 * 60 * 60_000;
const negativeTtlMs = 60_000;
const cache = new Map<string, { value: number | null; expires: number }>();
const inFlight = new Map<string, Promise<number | null>>();
const maxEntries = 400;
const maxConcurrentLookups = 4;

export class ReplayHistoryBoundsBusyError extends Error {}

function validTimestamp(value: unknown): number | null {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > Date.UTC(2010, 0, 1) &&
    timestamp < Date.now() ? timestamp : null;
}

async function fetchEarliestAvailable(
  exchange: ExchangeId, market: MarketType, symbol: string
): Promise<number | null> {
  if (exchange === 'binance') {
    // Binance Klines with startTime=1 are returned from the beginning of the
    // instrument's trading history. Use 1m, not daily bars: a contract often
    // launches halfway through the UTC day. Reuse the shared IP budget.
    const candles = await fetchKlines(exchange, market, symbol, '1m', 10, 1, undefined, { chart: true });
    const first = candles.reduce((value, candle) => Math.min(value, candle.time * 1000), Infinity);
    return validTimestamp(first);
  }

  if (exchange === 'bybit') {
    // Bybit V5 includes launchTime for linear futures. For spot, some
    // instruments omit it; in that case never invent a listing date.
    const category = market === 'futures' ? 'linear' : 'spot';
    const url = 'https://api.bybit.com/v5/market/instruments-info?' +
      new URLSearchParams({ category, symbol });
    const response = await chartExchangeFetch(url, { signal: AbortSignal.timeout(4_000) });
    if (!response.ok) return null;
    const json = await response.json();
    if (json?.retCode !== 0 || !Array.isArray(json?.result?.list)) return null;
    const instrument = json.result.list.find((row: any) => row?.symbol === symbol);
    return validTimestamp(instrument?.launchTime);
  }

  return null;
}

export function getReplayHistoryStart(
  exchange: ExchangeId, market: MarketType, symbol: string,
): Promise<number | null> {
  const key = `${exchange}:${market}:${symbol}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expires > now) return Promise.resolve(cached.value);
  const pending = inFlight.get(key);
  if (pending) return pending;
  if (inFlight.size >= maxConcurrentLookups)
    return Promise.reject(new ReplayHistoryBoundsBusyError('Replay history lookup capacity reached'));

  const lookup = (async () => {
    let result: number | null = null;
    try { result = await fetchEarliestAvailable(exchange, market, symbol); }
    catch { /* Unknown boundary must not be presented as a verified listing date. */ }
    cache.delete(key);
    cache.set(key, { value: result, expires: Date.now() + (result ? positiveTtlMs : negativeTtlMs) });
    while (cache.size > maxEntries) cache.delete(cache.keys().next().value!);
    return result;
  })();
  inFlight.set(key, lookup);
  void lookup.finally(() => {
    if (inFlight.get(key) === lookup) inFlight.delete(key);
  }).catch(() => {});
  return lookup;
}
