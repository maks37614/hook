import type { ExchangeId, MarketType, Kline } from '../src/types';
import { fetchKlines } from './marketService';
import { marketTickerFeed, type RawTicker } from './marketTickerFeed';

export const MINUTE_AV_MIN_USD = 200_000;
// Bounded candidate scan. Never make one request per listed market every minute.
export const MAX_AV_CANDIDATES_PER_SOURCE = 24;
export type MinuteTurnover = { volume1mUsd: number | null; minuteStart: number };
export type MinuteRankRow = { exchange: ExchangeId; marketType: MarketType; symbol: string; volume1mUsd: number; minuteStart: number };
export type MinuteTop = { rows: MinuteRankRow[]; sampled: number; universe: number; partial: boolean; minuteStart: number };
export type CandleReader = (exchange: ExchangeId, market: MarketType, symbol: string) => Promise<Kline[]>;
export type MarketReader = (exchange: ExchangeId, market: MarketType) => Promise<RawTicker[]>;

/** Latest *completed* 60s candle; never divide a 24h ticker by 1440. */
export function completedMinuteStart(now: number): number {
  return Math.floor((now - 3000) / 60_000) * 60_000 - 60_000;
}
export function readOneMinuteTurnover(candles: readonly Kline[], minuteStart: number): MinuteTurnover {
  const candle = candles.find(row => row.time * 1000 === minuteStart);
  const volume = candle?.quoteVolume;
  return { minuteStart, volume1mUsd: typeof volume === 'number' && Number.isFinite(volume) && volume >= 0 ? volume : null };
}

/** Sort candidate lists from existing 24h tickers only for selection; ranking is true 1m data. */
export function chooseMinuteCandidates(rows: readonly RawTicker[], limit = MAX_AV_CANDIDATES_PER_SOURCE): RawTicker[] {
  const valid = rows.filter(row => /^[A-Z0-9]{3,30}$/.test(row.symbol) && row.symbol.endsWith('USDT')
    && Number.isFinite(row.price) && row.price > 0 && Number.isFinite(row.volumeUsd) && row.volumeUsd >= 0);
  const seen = new Set<string>();
  const selected: RawTicker[] = [];
  for (const row of [...valid].sort((a,b) => b.volumeUsd - a.volumeUsd).slice(0, Math.max(0, limit - 6))) {
    if (!seen.has(row.symbol)) { seen.add(row.symbol); selected.push(row); }
  }
  for (const row of [...valid].sort((a,b) => Math.abs(b.change24h) - Math.abs(a.change24h))) {
    if (selected.length >= limit) break;
    if (!seen.has(row.symbol)) { seen.add(row.symbol); selected.push(row); }
  }
  return selected;
}

export class MinuteTurnoverService {
  private readings = new Map<string, { at: number; value: MinuteTurnover }>();
  private inFlight = new Map<string, Promise<MinuteTurnover>>();
  private topCached: {at:number; minuteStart:number; value: MinuteTop} | null = null;
  private topPending: Promise<MinuteTop> | null = null;
  private publicMinuteStart = 0;
  private publicChartSymbols = new Set<string>();
  constructor(
    // Reuse the exact 1m candles already served to HookChart by the shared
    // marketService cache and its chart-priority IP budget. The old
    // requireFresh:true bypassed a valid chart candle cache and, under heavy
    // background REST load, returned [] even while /api/klines had a verified
    // closed minute. readOneMinuteTurnover still requires the exact target
    // minute, so a cached but stale candle can never masquerade as live AV.
    private readCandles: CandleReader = (exchange, market, symbol) => fetchKlines(exchange, market, symbol, '1m', 10, undefined, undefined, { chart: true }),
    private readMarket: MarketReader = (exchange, market) => marketTickerFeed.get(exchange, market),
    private now: () => number = Date.now,
  ) {}
  async coin(exchange: ExchangeId, market: MarketType, symbol: string, minuteStart = completedMinuteStart(this.now())): Promise<MinuteTurnover> {
    const key = [exchange, market, symbol, minuteStart].join(':');
    const now = this.now();
    const cached = this.readings.get(key);
    if (cached && now - cached.at < (cached.value.volume1mUsd === null ? 12_000 : 75_000)) return cached.value;
    const pending = this.inFlight.get(key);
    if (pending) return pending;
    const operation = this.readCandles(exchange, market, symbol)
      .then(rows => readOneMinuteTurnover(rows, minuteStart))
      .catch(() => ({ minuteStart, volume1mUsd: null }))
      .then(value => {
        this.readings.set(key, { at: this.now(), value });
        if (this.readings.size > 360) {
          const old = this.readings.keys().next().value;
          if (old) this.readings.delete(old);
        }
        return value;
      }).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, operation);
    return operation;
  }
  /** Public chart lookups have a separate global distinct-symbol allowance.
   * This prevents arbitrary client-supplied tickers from exhausting shared
   * Binance/Bybit IP budgets, while reusing already sampled ranking candles. */
  async publicCoin(exchange: ExchangeId, market: MarketType, symbol: string): Promise<MinuteTurnover> {
    const minuteStart = completedMinuteStart(this.now());
    if (this.publicMinuteStart !== minuteStart) {
      this.publicMinuteStart = minuteStart;
      this.publicChartSymbols.clear();
    }
    const key = [exchange,market,symbol,minuteStart].join(':');
    if (!this.readings.has(key) && !this.inFlight.has(key) && !this.publicChartSymbols.has(key)) {
      if (this.publicChartSymbols.size >= 48) return { minuteStart, volume1mUsd: null };
      this.publicChartSymbols.add(key);
    }
    return this.coin(exchange, market, symbol, minuteStart);
  }
  async top(): Promise<MinuteTop> {
    const minuteStart = completedMinuteStart(this.now());
    if (this.topCached?.minuteStart === minuteStart && this.now() - this.topCached.at < 55_000) return this.topCached.value;
    if (this.topPending) return this.topPending;
    const operation = this.computeTop(minuteStart).then(value => {
      this.topCached = { at: this.now(), minuteStart, value };
      return value;
    }).finally(() => { this.topPending = null; });
    this.topPending = operation;
    return operation;
  }
  private async computeTop(minuteStart: number): Promise<MinuteTop> {
    const sources: Array<[ExchangeId, MarketType]> = [
      ['binance','futures'],['binance','spot'],['bybit','futures'],['bybit','spot'],
    ];
    const tickerLists = await Promise.all(sources.map(async ([exchange,marketType]) => {
      try { return await this.readMarket(exchange, marketType); } catch { return [] as RawTicker[]; }
    }));
    const candidates = tickerLists.flatMap(list => chooseMinuteCandidates(list));
    const universe = tickerLists.reduce((sum,list)=>sum+list.length,0);
    const rows: MinuteRankRow[] = [];
    // Limit in-flight exchange REST even when many clients ask for this top-ten.
    let next = 0;
    await Promise.all(Array.from({length: Math.min(4,candidates.length)}, async () => {
      while (next < candidates.length) {
        const candidate = candidates[next++];
        const value = await this.coin(candidate.exchange, candidate.marketType, candidate.symbol, minuteStart);
        if (value.volume1mUsd !== null && value.volume1mUsd >= MINUTE_AV_MIN_USD) rows.push({
          symbol: candidate.symbol, exchange: candidate.exchange, marketType: candidate.marketType,
          minuteStart: value.minuteStart, volume1mUsd: value.volume1mUsd,
        });
      }
    }));
    rows.sort((a,b)=>b.volume1mUsd-a.volume1mUsd ||
      [a.exchange,a.marketType,a.symbol].join(':').localeCompare([b.exchange,b.marketType,b.symbol].join(':')));
    // Return all qualifying sampled markets. The Terminal applies exchange/spot
    // filters BEFORE selecting its top ten; a global cut would hide valid rows.
    return { rows, sampled: candidates.length, universe,
      partial: candidates.length < universe, minuteStart };
  }
}

export const minuteTurnoverService = new MinuteTurnoverService();
