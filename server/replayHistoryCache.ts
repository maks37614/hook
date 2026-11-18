import type { ExchangeId, Kline, MarketType, Timeframe } from '../src/types';

/**
 * Optional, best-effort memory archive of already requested historical chart candles.
 * Reading NEVER makes an HTTP request and NEVER schedules a background fill.
 * Keep an independent, strict budget so Replay cannot grow with the user count.
 */
const MAX_CACHED_CANDLES = 30_000;
const MAX_CANDLES_PER_SERIES = 1_800;
const MAX_SERIES = 48;
const MAX_AGE_MS = 2 * 60 * 60 * 1000;
const FRAME_SECONDS: Partial<Record<Timeframe, number>> = {
  '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400,
};

type MarketKey = {
  exchange: ExchangeId;
  market: MarketType;
  symbol: string;
  timeframe: Timeframe;
};
type CacheEntry = { bars: Map<number, Kline>; updatedAt: number };

export class ReplayHistoryCache {
  private entries = new Map<string, CacheEntry>();
  private candleCount = 0;

  private key(source: MarketKey) {
    return [source.exchange, source.market, source.symbol.toUpperCase(), source.timeframe].join(':');
  }

  private remove(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.candleCount -= entry.bars.size;
    this.entries.delete(key);
  }

  record(source: MarketKey, candles: readonly Kline[], now = Date.now()): void {
    const frame = FRAME_SECONDS[source.timeframe];
    if (!frame || !candles.length) return;
    const key = this.key(source);
    const entry = this.entries.get(key) ?? { bars: new Map<number, Kline>(), updatedAt: now };
    let accepted = 0;
    for (const bar of candles) {
      const timestamp = bar.time;
      // Cache only confirmed, valid OHLCV. An in-progress candle may change.
      if (!Number.isSafeInteger(timestamp) || timestamp <= 0 || timestamp % frame !== 0
        || (timestamp + frame) * 1000 > now
        || ![bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite)
        || bar.low <= 0 || bar.high < Math.max(bar.open, bar.close)
        || bar.low > Math.min(bar.open, bar.close) || bar.volume < 0) continue;
      if (!entry.bars.has(timestamp)) this.candleCount++;
      entry.bars.set(timestamp, bar);
      accepted++;
    }
    // A bad or still-open exchange response must not refresh the historical
    // archive's retention clock or displace a useful LRU entry.
    if (!accepted) return;
    // Keep the newest bars per instrument, even when old and new ranges overlap.
    if (entry.bars.size > MAX_CANDLES_PER_SERIES) {
      const times = [...entry.bars.keys()].sort((a, b) => a - b);
      for (const time of times.slice(0, times.length - MAX_CANDLES_PER_SERIES)) {
        entry.bars.delete(time);
        this.candleCount--;
      }
    }
    entry.updatedAt = now;
    this.entries.delete(key);
    this.entries.set(key, entry);
    // LRU eviction is done on writes only; cache reads are bounded by one series.
    while (this.entries.size > MAX_SERIES || this.candleCount > MAX_CACHED_CANDLES) {
      this.remove(this.entries.keys().next().value!);
    }
  }

  olderThan(source: MarketKey, beforeTime: number, limit = MAX_CANDLES_PER_SERIES, now = Date.now()): Kline[] {
    const frame = FRAME_SECONDS[source.timeframe];
    if (!frame || !Number.isSafeInteger(beforeTime) || beforeTime <= 0) return [];
    const key = this.key(source);
    const entry = this.entries.get(key);
    if (!entry) return [];
    if (now < entry.updatedAt || now - entry.updatedAt > MAX_AGE_MS) {
      this.remove(key);
      return [];
    }
    // Replay may prepend only the uninterrupted prefix immediately before its
    // first candle. Stop at the first hole instead of serializing unrelated
    // cached ranges (up to 1800 candles) to every requesting browser.
    const boundedLimit = Number.isFinite(limit)
      ? Math.min(MAX_CANDLES_PER_SERIES, Math.max(1, Math.floor(limit)))
      : MAX_CANDLES_PER_SERIES;
    const prefix: Kline[] = [];
    const alignedBefore = Math.ceil(beforeTime / frame) * frame;
    for (let time = alignedBefore - frame; time > 0 && prefix.length < boundedLimit; time -= frame) {
      const bar = entry.bars.get(time);
      if (!bar) break;
      prefix.push(bar);
    }
    // Touch series, not every bar; the same cached history serves every user.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return prefix.reverse();
  }

  stats() {
    return { series: this.entries.size, candles: this.candleCount, maxCandles: MAX_CACHED_CANDLES };
  }
}

export const replayHistoryCache = new ReplayHistoryCache();
