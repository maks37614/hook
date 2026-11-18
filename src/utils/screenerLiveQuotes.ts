import type { ExchangeId, MarketCoin, MarketType } from '../types';
import { normalizeExchangeSymbol, isValidExchangeSymbol } from './marketSymbols';

export const SCREENER_FULL_REFRESH_MS = 40_000;
export const SCREENER_LIVE_PAINT_MS = 500;
// VPS caches serialized quote responses for up to 2 seconds. Include a small
// transport margin when retaining WS prices across a 40s REST reconciliation.
export const SCREENER_REST_CACHE_GRACE_MS = 2_500;
const MAX_TICK_AGE_MS = 15_000;

export type ScreenerLiveScope = { exchange: ExchangeId; marketType: MarketType; symbol: string };
export type ScreenerLiveQuote = ScreenerLiveScope & {
  price: number; change24h: number; volumeUsd: number; high24h: number; low24h: number;
  openInterestUsd?: number; fundingRatePct?: number;
};
export const screenerLiveScopeKey = (scope: ScreenerLiveScope) =>
  [scope.exchange, scope.marketType, normalizeExchangeSymbol(scope.symbol)].join(':');

export function screenerVisibleScopes(coins: readonly MarketCoin[], displayLimit: number): ScreenerLiveScope[] {
  const selected = new Map<string, ScreenerLiveScope>();
  for (const coin of coins.slice(0, Math.min(100, Math.max(0, displayLimit)))) {
    if (!isValidExchangeSymbol(coin.symbol)) continue;
    const scope = { exchange: coin.exchange, marketType: coin.marketType, symbol: normalizeExchangeSymbol(coin.symbol) };
    selected.set(screenerLiveScopeKey(scope), scope);
  }
  return [...selected.values()].sort((a, b) =>
    screenerLiveScopeKey(a).localeCompare(screenerLiveScopeKey(b)));
}

export function readScreenerLiveQuotePacket(raw: unknown, now = Date.now()): ScreenerLiveQuote[] {
  if (!raw || typeof raw !== 'object') return [];
  const packet = raw as { type?: unknown; at?: unknown; rows?: unknown };
  if (packet.type !== 'quotes' || !Number.isSafeInteger(packet.at) ||
      (packet.at as number) > now + 2_000 || now - (packet.at as number) > MAX_TICK_AGE_MS ||
      !Array.isArray(packet.rows) || packet.rows.length > 100) return [];
  const result: ScreenerLiveQuote[] = [];
  for (const row of packet.rows) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Partial<ScreenerLiveQuote>;
    if ((item.exchange !== 'binance' && item.exchange !== 'bybit') ||
        (item.marketType !== 'spot' && item.marketType !== 'futures') ||
        typeof item.symbol !== 'string' || !isValidExchangeSymbol(item.symbol) ||
        !Number.isFinite(item.price) || (item.price ?? 0) <= 0 ||
        !Number.isFinite(item.change24h) || !Number.isFinite(item.volumeUsd) ||
        (item.volumeUsd ?? -1) < 0 ||
        !Number.isFinite(item.high24h) || !Number.isFinite(item.low24h) ||
        (item.high24h ?? 0) <= 0 || (item.low24h ?? 0) <= 0 ||
        (item.high24h ?? 0) < (item.low24h ?? 0) ||
        (item.openInterestUsd !== undefined && (!Number.isFinite(item.openInterestUsd) || item.openInterestUsd < 0)) ||
        (item.fundingRatePct !== undefined && !Number.isFinite(item.fundingRatePct))) continue;
    result.push({
      exchange: item.exchange, marketType: item.marketType,
      symbol: normalizeExchangeSymbol(item.symbol),
      price: item.price!, change24h: item.change24h!, volumeUsd: item.volumeUsd!,
      high24h: item.high24h!, low24h: item.low24h!,
      ...(item.openInterestUsd !== undefined ? { openInterestUsd: item.openInterestUsd } : {}),
      ...(item.fundingRatePct !== undefined ? { fundingRatePct: item.fundingRatePct } : {}),
    });
  }
  return result;
}

/** Reapply fresh WS quotes that may be newer than a two-second cached
 * HTTP snapshot, including packets received just before the fetch began.
 * Do NOT reapply arbitrarily old websocket quotes to a fresh REST result.
 */
export function liveQuotesForReconciledSnapshot(
  items: Iterable<{ quote: ScreenerLiveQuote; at: number }>,
  requestStartedAt: number,
  now = Date.now(),
): ScreenerLiveQuote[] {
  const earliest = Math.max(requestStartedAt - SCREENER_REST_CACHE_GRACE_MS, now - 15_000);
  const result: ScreenerLiveQuote[] = [];
  for (const item of items) {
    if (item.at >= earliest && item.at <= now + 2_000) result.push(item.quote);
  }
  return result;
}

/** Patches only existing REST-discovered symbols; no WS-only fabricated rows.
 * Preserves historical 5m volatility, geographical locations and formation data.
 * Filtering/sorting uses the resulting new in-memory quote fields immediately.
 */
export function applyScreenerLiveQuotes(
  coins: readonly MarketCoin[], updates: readonly ScreenerLiveQuote[],
): MarketCoin[] {
  if (!coins.length || !updates.length) return coins as MarketCoin[];
  const latest = new Map(updates.map(row => [screenerLiveScopeKey(row), row]));
  let changed = false;
  const next = coins.map(coin => {
    const quote = latest.get(screenerLiveScopeKey(coin));
    if (!quote || (coin.price === quote.price && coin.change24h === quote.change24h &&
      coin.volumeUsd === quote.volumeUsd && coin.high24h === quote.high24h &&
      coin.low24h === quote.low24h &&
      (quote.openInterestUsd === undefined || quote.openInterestUsd === coin.openInterestUsd) &&
      (quote.fundingRatePct === undefined || quote.fundingRatePct === coin.fundingRatePct))) return coin;
    changed = true;
    const high = quote.high24h;
    const low = quote.low24h;
    const volatility24hPct = Math.max(0, (high - low) / low * 100);
    const vol5m = coin.volatility5mPct ?? volatility24hPct * 0.12;
    return {
      ...coin, price: quote.price, change24h: quote.change24h, volumeUsd: quote.volumeUsd,
      high24h: high, low24h: low,
      volatility24hPct: Number(volatility24hPct.toFixed(2)),
      distanceToHighPct: Number((Math.max(0, (high - quote.price) / high * 100)).toFixed(2)),
      distanceToLowPct: Number((Math.max(0, (quote.price - low) / low * 100)).toFixed(2)),
      isActiveCoin: (vol5m >= 0.8 && quote.volumeUsd >= 1_000_000) ||
        volatility24hPct >= 4 || Math.abs(quote.change24h) >= 5,
      ...(quote.openInterestUsd !== undefined ? { openInterestUsd: quote.openInterestUsd } : {}),
      ...(quote.fundingRatePct !== undefined ? { fundingRatePct: quote.fundingRatePct } : {}),
    };
  });
  return changed ? next : coins as MarketCoin[];
}
