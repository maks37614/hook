import type { ExchangeId, MarketType } from '../../src/types';
import { normalizeExchangeSymbol } from '../../src/utils/marketSymbols';
import { fetchSingleExchangeOI, type ExchangeOIData } from '../marketService';

type OiFetcher = (exchange: ExchangeId, symbol: string, baseAsset?: string, price?: number) => Promise<ExchangeOIData | null>;

export interface OiMarket {
  exchange: ExchangeId;
  marketType: MarketType;
  symbol: string;
  baseAsset: string;
}

export interface OiSubscriber {
  /** Only live futures subscriptions with no fresh exchange WS OI need REST. */
  needsRest(): boolean;
  currentPrice(): number;
  /** Every owner keeps an independent OI baseline and notification history. */
  onSample(sample: ExchangeOIData, requestStartedAt: number): void;
}

type OiMarketEntry = {
  market: OiMarket;
  subscribers: Set<OiSubscriber>;
  initial: NodeJS.Timeout | null;
  interval: NodeJS.Timeout | null;
  inFlight: boolean;
};

/** One OI sampling clock and one REST fallback per public futures instrument.
 * A shared network sample is converted to each subscriber's own current price
 * before it updates their private VolumeAndOIEngine. Bybit WS OI always wins
 * over a stale fallback request.
 */
export class SharedOiPoller {
  private readonly markets = new Map<string, OiMarketEntry>();
  private fetches = 0;
  private skippedFreshWs = 0;
  constructor(
    private readonly fetcher: OiFetcher = fetchSingleExchangeOI,
    private readonly schedule = true,
    private readonly now: () => number = Date.now,
  ) {}

  private key(market: OiMarket): string {
    return `${market.exchange}:${market.marketType}:${normalizeExchangeSymbol(market.symbol)}`;
  }

  subscribe(market: OiMarket, subscriber: OiSubscriber): () => void {
    if (market.marketType !== 'futures') return () => {};
    const key = this.key(market);
    let entry = this.markets.get(key);
    if (!entry) {
      entry = {
        market: { ...market, symbol: normalizeExchangeSymbol(market.symbol) },
        subscribers: new Set<OiSubscriber>(),
        initial: null,
        interval: null,
        inFlight: false,
      };
      this.markets.set(key, entry);
      if (this.schedule) {
        // One deterministic phase per symbol (not per account) avoids bursts.
        const phase = [...key].reduce((sum, ch) =>
          (sum * 31 + ch.charCodeAt(0)) % 10_000, 0);
        const current = entry;
        entry.initial = setTimeout(() => {
          current.initial = null;
          if (this.markets.get(key) !== current) return;
          void this.pollMarket(key);
          current.interval = setInterval(() => { void this.pollMarket(key); }, 60_000);
        }, phase);
      }
    }
    entry.subscribers.add(subscriber);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      entry!.subscribers.delete(subscriber);
      if (entry!.subscribers.size !== 0) return;
      if (entry!.initial) clearTimeout(entry!.initial);
      if (entry!.interval) clearInterval(entry!.interval);
      if (this.markets.get(key) === entry) this.markets.delete(key);
    };
  }

  /** Exposed for deterministic offline tests and safe one-off diagnostics. */
  async pollMarket(key: string): Promise<void> {
    const entry = this.markets.get(key);
    if (!entry || entry.inFlight) return;
    const eligible = [...entry.subscribers].filter(sub =>
      sub.needsRest() && Number.isFinite(sub.currentPrice()) && sub.currentPrice() > 0);
    if (eligible.length === 0) {
      this.skippedFreshWs++;
      return;
    }
    entry.inFlight = true;
    const startedAt = this.now();
    try {
      this.fetches++;
      const data = await this.fetcher(entry.market.exchange, entry.market.symbol,
        entry.market.baseAsset, eligible[0].currentPrice());
      if (!data || !Number.isFinite(data.amountCoins) || data.amountCoins <= 0) return;
      for (const subscriber of eligible) {
        // The worker might have been destroyed or accepted newer Bybit WS OI
        // while the REST fallback was pending.
        if (this.markets.get(key) !== entry || !entry.subscribers.has(subscriber)
            || !subscriber.needsRest()) continue;
        const price = subscriber.currentPrice();
        if (!Number.isFinite(price) || price <= 0) continue;
        const valueUsd = data.exchange === 'binance'
          ? data.amountCoins * price : data.valueUsd;
        if (!Number.isFinite(valueUsd) || valueUsd <= 0) continue;
        try { subscriber.onSample({ ...data, valueUsd }, startedAt); }
        catch (error) { console.error('[SharedOiPoller] Subscriber error:', error); }
      }
    } catch (error) {
      console.warn('[SharedOiPoller] Market sample unavailable:', error);
    } finally {
      entry.inFlight = false;
    }
  }

  stats() {
    return {
      markets: this.markets.size,
      subscribers: [...this.markets.values()].reduce((sum, e) => sum + e.subscribers.size, 0),
      inFlight: [...this.markets.values()].filter(e => e.inFlight).length,
      fetches: this.fetches,
      skippedFreshWs: this.skippedFreshWs,
    };
  }
}

export const sharedOiPoller = new SharedOiPoller();
