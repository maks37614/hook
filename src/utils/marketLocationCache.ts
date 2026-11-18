import type { ExchangeId, MarketType, Kline, MarketCoin } from '../types';
import { classifyMarketLocation, prepareLocationHistory, type LocationHistory, DAY_SECONDS } from './marketLocation';

type Identity = Pick<MarketCoin, 'exchange' | 'marketType' | 'symbol'>;
type FetchDaily = (exchange: ExchangeId, market: MarketType, symbol: string) => Promise<Kline[]>;
const keyOf = (c: Identity) => `${c.exchange}:${c.marketType}:${c.symbol.toUpperCase()}`;

/** Shared server/browser policy: nonblocking, bounded queue, coalesced history requests. */
export class MarketLocationCache {
  private entries = new Map<string, { history: LocationHistory | null; retryAt: number }>();
  private pending = new Set<string>();
  private queue: Identity[] = [];
  private active = 0;
  constructor(private fetchDaily: FetchDaily, private clock = Date.now, private concurrency = 3, private minRequestMs = 1500) {}

  enrich(coins: MarketCoin[]): MarketCoin[] {
    const now = this.clock();
    const result = coins.map(coin => {
      const key = keyOf(coin);
      const entry = this.entries.get(key);
      if ((!entry || now >= entry.retryAt) && !this.pending.has(key) && this.pending.size < 5000) {
        this.pending.add(key);
        this.queue.push({ exchange: coin.exchange, marketType: coin.marketType, symbol: coin.symbol });
      }
      return { ...coin, ...classifyMarketLocation(coin.price, entry?.history ?? null, now) };
    });
    this.pump();
    return result;
  }

  private pump(): void {
    while (this.active < this.concurrency && this.queue.length) {
      const coin = this.queue.shift()!;
      const key = keyOf(coin);
      this.active++;
      const started = Date.now();
      void Promise.resolve().then(() => this.fetchDaily(coin.exchange, coin.marketType, coin.symbol))
        .then(candles => prepareLocationHistory(candles, this.clock()))
        .catch(() => null)
        .then(history => {
          const now = this.clock();
          const previous = this.entries.get(key)?.history ?? null;
          const nextDay = (Math.floor(now / 1000 / DAY_SECONDS) + 1) * DAY_SECONDS * 1000;
          this.entries.delete(key);
          this.entries.set(key, { history: history ?? previous,
            retryAt: history ? Math.min(now + 3600_000, nextDay + 60_000) : now + 300_000 });
          if (this.entries.size > 5000) this.entries.delete(this.entries.keys().next().value!);
        }).finally(() => {
          const finish = () => {
            this.pending.delete(key);
            this.active--;
            this.pump();
          };
          // At most two history requests/second, even when the exchange is fast.
          const delay = Math.max(0, this.minRequestMs - (Date.now() - started));
          if (!delay) finish();
          else {
            const timer = setTimeout(finish, delay);
            if (typeof timer === 'object' && 'unref' in timer) timer.unref();
          }
        });
    }
  }
}
