import type { ExchangeId, MarketType, MarketCoin } from '../types';
import { fetchDirectBinanceTickers, fetchDirectBybitTickers, type DirectTickerSourceStatus } from './directExchangeClient';
import { MarketRequestError, requestMarketJson } from './marketRequests';

export interface MarketSelection {
  exchange: 'all' | ExchangeId;
  marketType: 'all' | MarketType;
}

export interface MarketCoinSnapshot {
  coins: MarketCoin[];
  timestamp: number | null;
  warning: string | null;
}

// Resolve fetch at request time: main.tsx installs auth/market transport after
// imported modules initialize. Capturing the native fetch here drops the session.
const defaultDependencies = { request: (...args: Parameters<typeof fetch>) => fetch(...args),
  binance: fetchDirectBinanceTickers, bybit: fetchDirectBybitTickers };

interface MarketSourceStatus {
  exchange: ExchangeId;
  marketType: MarketType;
  status: 'live' | 'stale' | 'unavailable';
  updatedAt?: number | null;
  error?: string;
}

function sourceWarning(sources: MarketSourceStatus[]): string | null {
  const affected = sources.filter(source => source.status !== 'live');
  return affected.length ? affected.map(source => {
    const name = `${source.exchange === 'binance' ? 'Binance' : 'Bybit'} ${source.marketType === 'spot' ? 'Spot' : 'Futures'}`;
    return `${name}: ${source.status === 'stale' ? 'показано останні отримані дані' : 'дані недоступні'}${source.error ? ` (${source.error})` : ''}`;
  }).join('; ') : null;
}

export async function loadMarketCoins(
  selection: MarketSelection,
  signal: AbortSignal,
  dependencies = defaultDependencies,
): Promise<MarketCoinSnapshot> {
  let backendError = 'Не вдалося отримати дані бірж. Перевірте з’єднання та повторіть запит.';
  try {
    const params = new URLSearchParams({ ...selection, minVolume: '0' });
    const result = await requestMarketJson([`/api/market/quotes?${params}`], {
      request: dependencies.request, signal,
      // Allow both bounded server-side attempts to finish before client fallback.
      timeoutMs: 30_000,
      // Structured source failures have already used the server's retry policy.
      shouldRetry: error => !Array.isArray(error.payload?.sources),
      validate(data) {
        if (data?.success !== true || !Array.isArray(data.data)) {
          throw new MarketRequestError(data?.error || 'Некоректна відповідь сервера', data?.success !== false,
            undefined, 0, data);
        }
      },
    });
    const warning = sourceWarning(Array.isArray(result.sources) ? result.sources : []);
    return { coins: result.data, timestamp: result.timestamp ?? null, warning };
  } catch (error) {
    if (error instanceof MarketRequestError && typeof error.payload?.error === 'string') backendError = error.payload.error;
    if (error instanceof MarketRequestError && ([401, 403].includes(error.status || 0) || Array.isArray(error.payload?.sources))) {
      throw new Error(backendError);
    }
    // Only a transport/proxy failure uses the compatibility fallback. A structured
    // source failure has already used the gateway; relaying it again adds load.
  }
  signal.throwIfAborted();
  const exchanges: ExchangeId[] = selection.exchange === 'all' ? ['binance', 'bybit'] : [selection.exchange];
  const markets: MarketType[] = selection.marketType === 'all' ? ['futures', 'spot'] : [selection.marketType];
  // Each selected source owns its bounded retry/timeout budget. Do not cut off
  // its second attempt with a shorter, competing outer timeout.
  const results = await Promise.all(exchanges.flatMap(exchange => markets.map(async marketType => {
    let source: DirectTickerSourceStatus | undefined;
    try {
      const data = await dependencies[exchange]({
        marketType, minVolumeUsd: 0,
        signal,
        onSourceStatus: status => { source = status; },
      });
      const coins = data.filter(coin => coin.exchange === exchange && coin.marketType === marketType);
      source ??= { exchange, marketType, status: coins.length ? 'live' : 'unavailable',
        updatedAt: coins.length ? Date.now() : null };
      return { coins, source };
    } catch (error) {
      return { coins: [], source: { exchange, marketType, status: 'unavailable' as const, updatedAt: null,
        error: error instanceof Error ? error.message : 'Помилка з’єднання' } };
    }
  })));
  signal.throwIfAborted();
  const sources = results.map(result => result.source);
  const live = sources.filter(source => source.status === 'live');
  if (live.length) {
    return { coins: results.flatMap(result => result.coins),
      timestamp: Math.min(...live.map(source => source.updatedAt!)), warning: sourceWarning(sources) };
  }
  throw new Error(backendError);
}
