import { createHash } from 'node:crypto';
import type { Kline, Timeframe } from '../../src/types';
import type { TimeframeStructure, LevelZone, DetectedPattern } from './types';

/** Only public market observations. No account, thresholds or notification
 * status is cached here: those are evaluated separately in every CoinWorker. */
export type SharedMarketIndicators = {
  structures: Record<Timeframe,TimeframeStructure>;
  zones: LevelZone[];
  patterns: DetectedPattern[];
};

export function candleFingerprint(series: readonly (readonly Kline[])[]): string {
  const hash = createHash('sha256');
  for (const candles of series) {
    hash.update(JSON.stringify(candles));
    hash.update(';');
  }
  return hash.digest('hex');
}

export class SharedMarketAnalysisCache<T> {
  private rows = new Map<string,{fingerprint:string;data:T;at:number}>();
  private hits = 0;
  private misses = 0;
  constructor(private readonly ttlMs = 6000, private readonly maxEntries = 64) {}
  get(key:string,fingerprint:string,calculate:()=>T,now=Date.now()):T {
    const row = this.rows.get(key);
    if (row && row.fingerprint === fingerprint && now >= row.at && now-row.at < this.ttlMs) {
      this.hits++;
      // The cache is capped because each market contains several indicator
      // arrays. Promote popular instruments on *read*: FIFO eviction could
      // discard BTC/ETH while rarely used markets retain the limited slots.
      // Preserve the original calculation timestamp so TTL never slides.
      this.rows.delete(key);
      this.rows.set(key, row);
      return row.data;
    }
    const data=calculate();
    this.misses++;
    this.rows.delete(key);
    this.rows.set(key,{fingerprint,data,at:now});
    while (this.rows.size>this.maxEntries) this.rows.delete(this.rows.keys().next().value!);
    return data;
  }
  stats(){return {entries:this.rows.size,hits:this.hits,misses:this.misses};}
}
export const sharedMarketAnalysis = new SharedMarketAnalysisCache<SharedMarketIndicators>();
