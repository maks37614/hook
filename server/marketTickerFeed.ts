import { exchangeFetch as fetch } from './exchangeGateway';
import type { ExchangeId, MarketType } from '../src/types';

import { MarketRequestError, requestMarketTickers, type MarketTicker } from '../src/utils/marketRequests';

export type RawTicker = MarketTicker;

export interface MarketSourceStatus {
  exchange: ExchangeId;
  marketType: MarketType;
  status: 'live' | 'stale' | 'unavailable';
  updatedAt: number | null;
  error?: string;
  httpStatus?: number;
}

interface FeedEntry {
  data: RawTicker[];
  updatedAt: number | null;
  retryAt: number;
  error?: string;
  httpStatus?: number;
  pending?: Promise<RawTicker[]>;
}

const FRESH_MS = 15_000;
const STALE_MS = 120_000;

/** Shares requests across screener, sentiment and formation scans. */
export class MarketTickerFeed {
  private entries = new Map<string, FeedEntry>();

  constructor(
    private request: typeof fetch = (input, init) => fetch(input, init),
    private now: () => number = Date.now,
  ) {}

  private entry(exchange: ExchangeId, market: MarketType): FeedEntry {
    const key = `${exchange}:${market}`;
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { data: [], updatedAt: null, retryAt: 0 };
      this.entries.set(key, entry);
    }
    return entry;
  }

  status(exchange: ExchangeId, market: MarketType): MarketSourceStatus {
    const entry = this.entry(exchange, market);
    const age = entry.updatedAt === null ? Infinity : this.now() - entry.updatedAt;
    return {
      exchange, marketType: market,
      status: age < FRESH_MS && !entry.error ? 'live' : age < STALE_MS ? 'stale' : 'unavailable',
      updatedAt: entry.updatedAt,
      ...(entry.error ? { error: entry.error } : {}),
      ...(entry.httpStatus ? { httpStatus: entry.httpStatus } : {}),
    };
  }

  async get(exchange: ExchangeId, market: MarketType): Promise<RawTicker[]> {
    const entry = this.entry(exchange, market);
    if (entry.pending) return entry.pending;
    if (this.status(exchange, market).status === 'live') return entry.data;
    if (this.now() < entry.retryAt) {
      return this.status(exchange, market).status === 'unavailable' ? [] : entry.data;
    }
    entry.pending = this.load(exchange, market, entry);
    try { return await entry.pending; } finally { entry.pending = undefined; }
  }

  private async load(exchange: ExchangeId, market: MarketType, entry: FeedEntry): Promise<RawTicker[]> {
    try {
      const data = await requestMarketTickers(exchange, market, {
        request: this.request, now: this.now,
        headers: { Accept: 'application/json', 'User-Agent': 'SignalHook/1.0' },
      });
      entry.data = data;
      entry.updatedAt = this.now();
      entry.retryAt = 0;
      entry.error = undefined;
      entry.httpStatus = undefined;
      return data;
    } catch (error) {
      const failure = error instanceof MarketRequestError ? error : undefined;
      entry.httpStatus = failure?.status;
      entry.error = failure?.message || 'Біржа не відповідає або повернула некоректні дані';
      // A denial or rate limit must not be retried through another hostname.
      const denied = [403, 451, 418, 429].includes(failure?.status || 0);
      const cooldown = failure?.status === 403 && exchange === 'bybit' ? 600_000
        : failure?.status === 418 ? 120_000 : denied ? 60_000 : 15_000;
      entry.retryAt = this.now() + Math.max(cooldown, failure?.retryAfterMs || 0);
    }
    return this.status(exchange, market).status === 'unavailable' ? [] : entry.data;
  }
}

export const marketTickerFeed = new MarketTickerFeed();

export function getMarketSourceStatuses(params: {
  exchange?: 'all' | ExchangeId;
  marketType?: 'all' | MarketType;
}): MarketSourceStatus[] {
  const exchanges: ExchangeId[] = params.exchange && params.exchange !== 'all' ? [params.exchange] : ['binance', 'bybit'];
  const markets: MarketType[] = params.marketType && params.marketType !== 'all' ? [params.marketType] : ['futures', 'spot'];
  return exchanges.flatMap(exchange => markets.map(market => marketTickerFeed.status(exchange, market)));
}
