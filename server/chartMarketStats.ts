import { chartExchangeFetch } from './exchangeHttp';
import { marketTickerFeed } from './marketTickerFeed';
import type { MarketType } from '../src/types';
import { normalizeExchangeSymbol } from '../src/utils/marketSymbols';

const cache = new Map<string, { at: number; value: number | null }>();
const flights = new Map<string, Promise<number | null>>();

/** Binance's rolling 24h ticker includes the true trade count. Bybit's
 * public 24h ticker does not expose an equivalent count, so it is not guessed. */
export function parseBinance24hTradeCount(payload: unknown, symbol: string): number | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const data = payload as Record<string, unknown>;
  if (data.symbol !== symbol || typeof data.count !== 'number') return null;
  return Number.isSafeInteger(data.count) && data.count >= 0 ? data.count : null;
}

export async function fetch24hTradeCount(
  exchange: string,
  market: MarketType,
  rawSymbol: string,
): Promise<number | null> {
  if (exchange !== 'binance' || (market !== 'spot' && market !== 'futures')) return null;
  const symbol = normalizeExchangeSymbol(rawSymbol);
  if (!/^[A-Z0-9]{3,30}$/.test(symbol)) return null;
  // Already refreshed by the shared ticker universe? Avoid another Binance REST call.
  const knownCount = marketTickerFeed.getBinance24hTradeCount(market, symbol);
  if (knownCount !== null) return knownCount;
  const key = `${market}:${symbol}`;
  const previous = cache.get(key);
  const now = Date.now();
  if (previous && now - previous.at < (previous.value === null ? 15_000 : 60_000)) return previous.value;
  const active = flights.get(key);
  if (active) return active;
  const flight = (async () => {
    const hosts = market === 'futures'
      ? ['https://fapi.binance.com/fapi/v1/ticker/24hr']
      : ['https://data-api.binance.vision/api/v3/ticker/24hr', 'https://api.binance.com/api/v3/ticker/24hr'];
    let value: number | null = null;
    for (const host of hosts) {
      try {
        const res = await chartExchangeFetch(`${host}?symbol=${encodeURIComponent(symbol)}`, { signal: AbortSignal.timeout(4500) });
        if (!res.ok) continue;
        value = parseBinance24hTradeCount(await res.json(), symbol);
        if (value !== null) break;
      } catch { /* No guess if Binance is unreachable. */ }
    }
    cache.set(key, { at: Date.now(), value });
    // Avoid permanently retaining tickers for symbols no longer used.
    if (cache.size > 500) {
      const earliest = cache.keys().next().value;
      if (earliest) cache.delete(earliest);
    }
    return value;
  })().finally(() => flights.delete(key));
  flights.set(key, flight);
  return flight;
}
