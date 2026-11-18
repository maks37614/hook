import type { ExchangeId, MarketType, SurveillanceConfig, SurveillanceState, Kline } from '../../src/types';
import { candleFingerprint } from './sharedMarketAnalysis';

export type SurveillanceCandles = Record<'1d' | '4h' | '1h' | '15m', Kline[]>;
type CacheEntry = { fingerprint: string; promise: Promise<SurveillanceState | null>; at: number };

/**
 * Reuse public OHLCV-derived calculations for accounts watching the same
 * instrument. Only the momentum lookback affects calculateSurveillanceState;
 * user thresholds, cooldowns, delivery settings and per-account events are
 * deliberately NOT cached.
 *
 * The key includes a 15-minute clock boundary because momentum considers
 * whether the latest bar is closed, even if the exchange has not published a
 * fresh OHLCV snapshot yet.
 */
export class SharedSurveillanceStateCache {
  private entries = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;
  private failures = 0;

  constructor(private readonly ttlMs = 5_000, private readonly maxEntries = 384) {}

  get(
    exchange: ExchangeId,
    marketType: MarketType,
    symbol: string,
    config: SurveillanceConfig,
    source: SurveillanceCandles,
    calculate: () => Promise<SurveillanceState | null>,
    now = Date.now(),
  ): Promise<SurveillanceState | null> {
    const key = JSON.stringify([
      exchange, marketType, symbol.toUpperCase(),
      config.momentumTf, config.momentumBars,
    ]);
    const fingerprint = candleFingerprint([
      source['1d'], source['4h'], source['1h'], source['15m'],
    ]) + ':' + Math.floor(now / 900_000);
    const existing = this.entries.get(key);
    if (existing && existing.fingerprint === fingerprint
      && now >= existing.at && now - existing.at < this.ttlMs) {
      this.hits++;
      return existing.promise;
    }
    this.misses++;
    const promise = Promise.resolve().then(calculate).catch(error => {
      this.failures++;
      // Never cache a failed calculation or poison all users of this coin.
      if (this.entries.get(key)?.promise === promise) this.entries.delete(key);
      throw error;
    });
    this.entries.delete(key);
    this.entries.set(key, { fingerprint, promise, at: now });
    while (this.entries.size > this.maxEntries)
      this.entries.delete(this.entries.keys().next().value!);
    return promise;
  }

  stats() {
    return { entries: this.entries.size, hits: this.hits,
      misses: this.misses, failures: this.failures };
  }
}

export const sharedSurveillanceState = new SharedSurveillanceStateCache();
