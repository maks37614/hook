import type { ExchangeId, MarketType, MarketCoin } from '../types';
import { sharedDesktopPublicQuotes } from './desktopMarketQuotes';
import { fetchDirectBinanceTickers, fetchDirectBybitTickers, type DirectTickerSourceStatus } from './directExchangeClient';

export interface MarketSelection {
  exchange: 'all' | ExchangeId;
  marketType: 'all' | MarketType;
}

export interface MarketCoinSnapshot {
  coins: MarketCoin[];
  timestamp: number | null;
  warning: string | null;
}

const defaultDependencies = { request: fetch, binance: fetchDirectBinanceTickers, bybit: fetchDirectBybitTickers };

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
  // Desktop windows share the same unprivileged site origin/Chromium partition.
  // Ordinary h00k.top browsers, account data, and test-injected transports keep
  // their existing behavior. A missing Web Lock/Channel simply uses fetch.
  const inDesktop = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('h00kDesktop') === '1';
  if (inDesktop && dependencies === defaultDependencies) {
    const key = JSON.stringify([selection.exchange, selection.marketType]);
    return sharedDesktopPublicQuotes().read(
      key, () => loadMarketCoinsUnshared(selection, signal, dependencies), signal,
    );
  }
  return loadMarketCoinsUnshared(selection, signal, dependencies);
}

async function loadMarketCoinsUnshared(
  selection: MarketSelection,
  signal: AbortSignal,
  dependencies = defaultDependencies,
): Promise<MarketCoinSnapshot> {
  let backendError = 'Не вдалося отримати дані бірж. Перевірте з’єднання та повторіть запит.';
  try {
    const params = new URLSearchParams({ ...selection, minVolume: '0' });
    // Native browser fetch rejects a non-Window receiver (Illegal invocation).
    // Invoke it as a standalone function, not as a method of the dependency bag.
    const request = dependencies.request;
    const response = await request(`/api/market/quotes?${params}`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]), cache: 'no-store',
    });
    if (response.headers.get('content-type')?.includes('application/json')) {
      const result = await response.json();
      if (response.ok && result.success && Array.isArray(result.data)) {
        const warning = sourceWarning(Array.isArray(result.sources) ? result.sources : []);
        return { coins: result.data, timestamp: result.timestamp ?? null, warning };
      }
      if (typeof result.error === 'string') backendError = result.error;
    }
  } catch { /* Browser networking may still allow a direct public market request. */ }
  signal.throwIfAborted();
  const exchanges: ExchangeId[] = selection.exchange === 'all' ? ['binance', 'bybit'] : [selection.exchange];
  const markets: MarketType[] = selection.marketType === 'all' ? ['futures', 'spot'] : [selection.marketType];
  // Each selected source gets its own request and timeout; a slow futures market
  // must not prevent the same exchange's spot quotes from loading.
  const results = await Promise.all(exchanges.flatMap(exchange => markets.map(async marketType => {
    let source: DirectTickerSourceStatus | undefined;
    try {
      const data = await dependencies[exchange]({
        marketType, minVolumeUsd: 0,
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
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
