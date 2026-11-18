import type { ExchangeId, MarketType, Timeframe, Kline } from '../../src/types';
import { normalizeExchangeSymbol } from '../../src/utils/marketSymbols';
import { fetchKlines } from '../marketService';
import { getTimeframeMs } from './multiTimeframeEngine';

type CandleLoader = (
  exchange: ExchangeId, market: MarketType, symbol: string, timeframe: Timeframe, limit: number
) => Promise<Kline[]>;

/**
 * Coalesce 24/7 surveillance's confirmed-candle reads across accounts.
 * The live chart and foreground screener retain their own freshness policies.
 * Never cache an empty/failed response, and invalidate at the NEXT candle boundary:
 * a 15m closing alert must never reuse the previous 15m bar's snapshot.
 */
export class SurveillanceCheckCandleCache {
  private readonly cached = new Map<string, { rows: Kline[]; at: number; expires: number; bucket: number }>();
  private readonly pending = new Map<string, { bucket: number; promise: Promise<Kline[]> }>();
  private hits = 0;
  private shared = 0;
  private misses = 0;

  constructor(
    private readonly fetcher: CandleLoader = (exchange, market, symbol, timeframe, limit) =>
      fetchKlines(exchange, market, symbol, timeframe, limit, undefined, undefined, { requireFresh: true }),
    private readonly now: () => number = Date.now,
    private readonly ttlMs = 18_000,
    private readonly maxEntries = 512,
  ) {}

  async get(exchange: ExchangeId, market: MarketType, symbol: string,
    timeframe: Timeframe, limit: number): Promise<Kline[]> {
    const clean = normalizeExchangeSymbol(symbol);
    const key = `${exchange}:${market}:${clean}:${timeframe}:${limit}`;
    const now = this.now();
    const period = getTimeframeMs(timeframe);
    const bucket = Math.floor(now / period);
    const ready = this.cached.get(key);
    if (ready && ready.bucket === bucket && ready.expires > now && now >= ready.at) {
      this.hits++;
      // A private snapshot per caller: no user's analysis may modify another's OHLCV.
      return ready.rows.map(c => ({ ...c }));
    }
    if (ready) this.cached.delete(key);
    const inflight = this.pending.get(key);
    // Never join a request that began before a candle boundary.
    if (inflight?.bucket === bucket) {
      this.shared++;
      const rows = await inflight.promise;
      return rows.map(c => ({ ...c }));
    }
    this.misses++;
    const work = (async () => {
      const rows = await this.fetcher(exchange, market, clean, timeframe, limit);
      if (rows.length > 0) {
        const at = this.now();
        // A network request crossing a close cannot be stored as the NEW
        // bar's snapshot. The next watcher must fetch closed-candle data again.
        if (Math.floor(at / period) === bucket) {
          const boundary = (bucket + 1) * period;
          this.cached.delete(key);
          this.cached.set(key, {
            rows: rows.map(c => ({ ...c })),
            at,
            bucket,
            expires: Math.min(at + this.ttlMs, boundary),
          });
          while (this.cached.size > this.maxEntries) {
            this.cached.delete(this.cached.keys().next().value!);
          }
        }
      }
      return rows;
    })();
    this.pending.set(key, { bucket, promise: work });
    try {
      const rows = await work;
      return rows.map(c => ({ ...c }));
    } finally {
      if (this.pending.get(key)?.promise === work) this.pending.delete(key);
    }
  }

  stats() { return { entries: this.cached.size, inFlight: this.pending.size,
    hits: this.hits, shared: this.shared, misses: this.misses }; }
}

export const surveillanceCheckCandleCache = new SurveillanceCheckCandleCache();
