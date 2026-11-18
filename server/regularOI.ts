import { exchangeFetch } from './exchangeHttp';
import type { ExchangeId, MarketType, Timeframe } from '../src/types';
import {
  requestRegularOI, getRegularOIRequest, type RegularOIResult,
  type VerifiedOISnapshot,
} from '../src/utils/regularOIHistory';

// Preserve existing imports and regression tests for the previous API.
export {
  verifyOIHistory, parseBinanceOIHistory, parseBybitOIHistory,
  type VerifiedOIPoint, type VerifiedOISnapshot,
} from '../src/utils/regularOIHistory';

const cache = new Map<string, { expires: number; result: RegularOIResult }>();
const active = new Map<string, Promise<RegularOIResult>>();

/** Server path is shared, bounded and cached; no fictional fallback OI. */
export async function fetchRegularOIResult(
  exchange: ExchangeId, market: MarketType, symbol: string, timeframe: Timeframe,
): Promise<RegularOIResult> {
  const target = getRegularOIRequest(exchange, market, symbol, timeframe);
  if ('reason' in target) return target;
  const key = `${exchange}:${symbol}:${timeframe}`;
  const found = cache.get(key);
  if (found && found.expires > Date.now()) return found.result;
  const pending = active.get(key);
  if (pending) return pending;
  const request = (async () => {
    // The shared exchangeFetch enforces the server's public API quota.
    const result = await requestRegularOI(exchange, market, symbol, timeframe, exchangeFetch,
      { timeoutMs: 5500 });
    cache.set(key, { result, expires: Date.now() + (result.snapshot ? 45_000 : 12_000) });
    if (cache.size > 600) cache.delete(cache.keys().next().value!);
    return result;
  })().finally(() => active.delete(key));
  active.set(key, request);
  return request;
}

export async function fetchRegularOISnapshot(
  exchange: ExchangeId, market: MarketType, symbol: string, timeframe: Timeframe,
): Promise<VerifiedOISnapshot | null> {
  return (await fetchRegularOIResult(exchange, market, symbol, timeframe)).snapshot;
}
