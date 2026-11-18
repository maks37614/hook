import { Kline, type ExchangeId, type MarketType, type Timeframe } from '../../src/types';
import { fetchKlines } from '../marketService';
import { BTCContextSnapshot, NewsItem, TradingSessionName } from './types';

export class MacroAndNewsEngine {
  private btcSnapshot: BTCContextSnapshot = {
    currentPrice: 84000,
    trend1d: 'Bullish',
    trend4h: 'Bullish',
    trend1h: 'Bullish',
    trend15m: 'Neutral',
    btcDominance: 58.4,
    btcDominanceRegime: 'range',
    totalMarketCapUsd: 2900000000000,
    totalMarketCapRegime: 'expansion',
    correlationAltBtc: 0.75,
    relativeStrength: 'NEUTRAL',
    lastUpdated: 0,
  };

  private lastSession: TradingSessionName = 'Asia';
  private newsCache: NewsItem[] = [];
  private btcRefreshInFlight: Promise<BTCContextSnapshot> | null = null;
  private lastBtcFetchAttemptAt = 0;

  constructor(
    private readonly getCandles: (
      exchange: ExchangeId, market: MarketType, symbol: string,
      timeframe: Timeframe, limit: number,
    ) => Promise<Kline[]> = (exchange, market, symbol, timeframe, limit) =>
      fetchKlines(exchange, market, symbol, timeframe, limit),
    private readonly now: () => number = Date.now,
  ) {
    this.lastSession = this.getCurrentSession();
  }

  public getCurrentSession(): TradingSessionName {
    const now = new Date();
    const day = now.getUTCDay();
    const hour = now.getUTCHours();

    if (day === 0 || day === 6) {
      return 'Weekend';
    }

    if (hour >= 12 && hour < 16) {
      return 'London/NY Overlap';
    } else if (hour >= 7 && hour < 16) {
      return 'London';
    } else if (hour >= 12 && hour < 21) {
      return 'New York';
    } else {
      return 'Asia';
    }
  }

  public checkSessionChange(): { changed: boolean; previous: TradingSessionName; current: TradingSessionName } {
    const current = this.getCurrentSession();
    if (current !== this.lastSession) {
      const prev = this.lastSession;
      this.lastSession = current;
      return { changed: true, previous: prev, current };
    }
    return { changed: false, previous: this.lastSession, current };
  }

  public async updateBTCContext(): Promise<BTCContextSnapshot> {
    const now = this.now();
    // All per-user workers must share a single BTC refresh, not each issue
    // four independent REST calls at the same 60-second cache boundary.
    if (this.btcSnapshot.lastUpdated && now >= this.btcSnapshot.lastUpdated
      && now - this.btcSnapshot.lastUpdated < 60_000) return this.btcSnapshot;
    if (this.btcRefreshInFlight) return this.btcRefreshInFlight;
    // A failed exchange request must not generate a reconnect/request storm.
    if (this.lastBtcFetchAttemptAt && now >= this.lastBtcFetchAttemptAt
      && now - this.lastBtcFetchAttemptAt < 15_000) return this.btcSnapshot;
    this.lastBtcFetchAttemptAt = now;

    const request = this.refreshBTCContext(now);
    this.btcRefreshInFlight = request;
    try { return await request; }
    finally {
      if (this.btcRefreshInFlight === request) this.btcRefreshInFlight = null;
    }
  }

  public btcCacheStats() {
    return { inFlight: Boolean(this.btcRefreshInFlight),
      cacheAgeMs: this.btcSnapshot.lastUpdated
        ? Math.max(0, this.now() - this.btcSnapshot.lastUpdated) : null };
  }

  private async refreshBTCContext(now: number): Promise<BTCContextSnapshot> {
    try {
      const [k1d, k4h, k1h, k15m] = await Promise.all([
        this.getCandles('binance', 'futures', 'BTCUSDT', '1d', 10).catch(() => []),
        this.getCandles('binance', 'futures', 'BTCUSDT', '4h', 15).catch(() => []),
        this.getCandles('binance', 'futures', 'BTCUSDT', '1h', 20).catch(() => []),
        this.getCandles('binance', 'futures', 'BTCUSDT', '15m', 20).catch(() => []),
      ]);

      if (!k1d.length && !k4h.length && !k1h.length && !k15m.length) {
        // Do not mark an empty exchange response as successfully refreshed.
        return this.btcSnapshot;
      }
      const curPrice = k15m.length > 0 ? k15m[k15m.length - 1].close : this.btcSnapshot.currentPrice;

      const evalTrend = (candles: Kline[]): 'Bullish' | 'Bearish' | 'Neutral' => {
        if (candles.length < 5) return 'Neutral';
        const start = candles[candles.length - 5].close;
        const end = candles[candles.length - 1].close;
        const pct = ((end - start) / start) * 100;
        if (pct > 0.8) return 'Bullish';
        if (pct < -0.8) return 'Bearish';
        return 'Neutral';
      };

      this.btcSnapshot = {
        currentPrice: curPrice,
        trend1d: evalTrend(k1d),
        trend4h: evalTrend(k4h),
        trend1h: evalTrend(k1h),
        trend15m: evalTrend(k15m),
        btcDominance: 58.5,
        btcDominanceRegime: 'range',
        totalMarketCapUsd: 2950000000000,
        totalMarketCapRegime: 'expansion',
        correlationAltBtc: 0.82,
        relativeStrength: 'NEUTRAL',
        lastUpdated: now,
      };
    } catch (e) {
      // Keep cached
    }

    return this.btcSnapshot;
  }

  public calculateAltCorrelation(altCandles: Kline[], btcCandles: Kline[]): number {
    const minLen = Math.min(altCandles.length, btcCandles.length);
    if (minLen < 10) return 0.7;

    const altChanges: number[] = [];
    const btcChanges: number[] = [];

    for (let i = 1; i < minLen; i++) {
      const altP = altCandles[i].close;
      const altPrev = altCandles[i - 1].close;
      altChanges.push((altP - altPrev) / altPrev);

      const btcP = btcCandles[i].close;
      const btcPrev = btcCandles[i - 1].close;
      btcChanges.push((btcP - btcPrev) / btcPrev);
    }

    // Pearson correlation
    const n = altChanges.length;
    const meanAlt = altChanges.reduce((a, b) => a + b, 0) / n;
    const meanBtc = btcChanges.reduce((a, b) => a + b, 0) / n;

    let num = 0;
    let denAlt = 0;
    let denBtc = 0;

    for (let i = 0; i < n; i++) {
      const dA = altChanges[i] - meanAlt;
      const dB = btcChanges[i] - meanBtc;
      num += dA * dB;
      denAlt += dA * dA;
      denBtc += dB * dB;
    }

    const den = Math.sqrt(denAlt * denBtc);
    if (den === 0) return 0.7;

    return Number(Math.max(-1, Math.min(1, num / den)).toFixed(2));
  }

  public getRelevantNews(symbol: string): NewsItem[] {
    const clean = symbol.replace('USDT', '').toUpperCase();
    return this.newsCache.filter((n) => n.symbols.includes(clean) || n.symbols.includes('ALL'));
  }
}
