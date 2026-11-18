import { useEffect, useState } from 'react';
import type { ExchangeId, MarketType } from '../types';
import { createScreenerQuoteSocket } from './screenerQuoteSocket';
import { screenerLiveScopeKey } from './screenerLiveQuotes';
import { isValidExchangeSymbol, normalizeExchangeSymbol } from './marketSymbols';

const LIVE_QUOTE_MAX_AGE = 75_000;
const SAVED_QUOTE_MAX_AGE = 120_000;
type MarketKey = { exchange: ExchangeId; marketType: MarketType; symbol: string };
export type Chart24hSample = { key: string; change24h: number; receivedAt: number };
export type Chart24hSnapshot = MarketKey & { priceChange24h: number; lastUpdated?: number };

/** Historical snapshots must not masquerade as an up-to-date 24h ticker. */
export function chart24hPercent(
  snapshot: Chart24hSnapshot,
  streamed: Chart24hSample | null,
  now = Date.now(),
): number | null {
  const key = screenerLiveScopeKey(snapshot);
  if (streamed?.key === key && Number.isFinite(streamed.change24h) &&
      streamed.receivedAt <= now + 2000 && now - streamed.receivedAt <= LIVE_QUOTE_MAX_AGE) {
    return streamed.change24h;
  }
  if (Number.isFinite(snapshot.priceChange24h) && Number.isFinite(snapshot.lastUpdated) &&
      (snapshot.lastUpdated ?? 0) > 0 && (snapshot.lastUpdated ?? 0) <= now + 2000 &&
      now - (snapshot.lastUpdated ?? 0) <= SAVED_QUOTE_MAX_AGE) {
    return snapshot.priceChange24h;
  }
  return null;
}

/**
 * Reuse the site's public quotes WebSocket, subscribing only to the one active
 * chart symbol. This never opens an exchange socket or requests a full market
 * list from the browser. One scheduled expiration removes a stopped feed.
 */
export function useChartLive24hQuote(scope: MarketKey, enabled = true): Chart24hSample | null {
  const key = screenerLiveScopeKey(scope);
  const [latest, setLatest] = useState<Chart24hSample | null>(null);
  useEffect(() => {
    if (!enabled || !isValidExchangeSymbol(normalizeExchangeSymbol(scope.symbol))) return;
    let expiration: ReturnType<typeof setTimeout> | null = null;
    const socket = createScreenerQuoteSocket((rows, at) => {
      const quote = rows.find(row => screenerLiveScopeKey(row) === key);
      if (!quote) return;
      setLatest({ key, change24h: quote.change24h, receivedAt: at });
      if (expiration !== null) clearTimeout(expiration);
      expiration = setTimeout(() => setLatest(previous =>
        previous?.key === key && previous.receivedAt === at ? null : previous), LIVE_QUOTE_MAX_AGE);
    });
    socket.updateScopes([{ exchange: scope.exchange, marketType: scope.marketType,
      symbol: normalizeExchangeSymbol(scope.symbol) }]);
    socket.start();
    return () => {
      socket.stop();
      if (expiration !== null) clearTimeout(expiration);
    };
  }, [key, enabled]);
  return enabled && latest?.key === key ? latest : null;
}
