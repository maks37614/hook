import { EventEmitter } from 'node:events';
import type { ExchangeId, MarketType, SurveillanceCoin } from '../../src/types';
import { normalizeExchangeSymbol } from '../../src/utils/marketSymbols';
import { fetchDualExchangeOI, fetchKlines } from '../marketService';
import { ExchangeStreamClient, type RawDepthDelta, type RawTradeEvent } from './exchangeStream';
import { LevelsAndFormationsEngine } from './levelsAndFormationsEngine';
import { MultiTimeframeEngine } from './multiTimeframeEngine';
import { VolumeAndOIEngine } from './volumeAndOIEngine';

type Instrument = Pick<SurveillanceCoin, 'symbol' | 'exchange' | 'marketType' | 'baseAsset'>;
type Price = { price: number; high24h: number; low24h: number; change24h?: number; volume24hUsd: number; time: number };
interface Dependencies {
  stream: (symbol: string, exchange: ExchangeId, market: MarketType) => ExchangeStreamClient;
  klines: typeof fetchKlines;
  oi: typeof fetchDualExchangeOI;
}
const defaults: Dependencies = { stream: (symbol, exchange, market) => new ExchangeStreamClient(symbol, exchange, market),
  klines: fetchKlines, oi: fetchDualExchangeOI };

/** Contains public market state only. Settings, setups and notifications stay in each user's worker. */
export class SharedCoinMarket extends EventEmitter {
  readonly volume = new VolumeAndOIEngine();
  readonly ready: Promise<void>;
  private candles = new MultiTimeframeEngine();
  private levels = new LevelsAndFormationsEngine();
  private stream: ExchangeStreamClient;
  private analysisTimer?: ReturnType<typeof setInterval>;
  private oiTimer?: ReturnType<typeof setInterval>;
  private stopped = false;
  private oiPending = false;
  private bids = new Map<number, number>();
  private asks = new Map<number, number>();
  private bookSequence = 0;
  private bookAt = 0;
  private bookValid = false;
  private analysis?: ReturnType<SharedCoinMarket['calculate']>;
  lastMarketPriceAt = 0;
  price: Price = { price: 0, high24h: 0, low24h: 0, volume24hUsd: 0, time: 0 };

  constructor(readonly instrument: Instrument, private dependencies = defaults) {
    super();
    this.setMaxListeners(0); // Subscribers are reference-counted by SharedCoinMarketPool.
    this.stream = dependencies.stream(instrument.symbol, instrument.exchange, instrument.marketType);
    this.stream.on('error', error => console.warn(`[Market ${instrument.symbol}]`, error));
    this.stream.on('price', (price: Price) => {
      if (this.stopped || !Number.isFinite(price.price) || price.price <= 0 ||
          !Number.isFinite(price.time) || Math.abs(Date.now() - price.time) > 15_000) return;
      this.lastMarketPriceAt = Date.now();
      this.price = { ...price, change24h: Number.isFinite(price.change24h) ? price.change24h : this.price.change24h };
      this.emit('price', this.price);
    });
    this.stream.on('trade', (trade: RawTradeEvent) => {
      if (this.stopped || !Number.isFinite(trade.price) || trade.price <= 0 ||
          !Number.isFinite(trade.time) || Math.abs(Date.now() - trade.time) > 15_000) return;
      this.lastMarketPriceAt = Date.now();
      this.price = { ...this.price, price: trade.price, time: trade.time };
      this.volume.addTrade(trade);
      this.candles.updateWithTrade(trade);
      this.emit('price', this.price);
    });
    this.stream.on('depth', (delta: RawDepthDelta) => this.receiveDepth(delta));
    this.stream.on('status', status => {
      if (status !== 'LIVE') this.bookValid = false;
      this.emit('status', status);
    });
    this.ready = this.initialize();
  }

  get status() { return this.stream.status; }

  private receiveDepth(delta: RawDepthDelta) {
    if (this.stopped) return;
    const sequence = delta.sequence || Date.now();
    if (!delta.isSnapshot && sequence <= this.bookSequence) return;
    if (delta.isSnapshot) { this.bids.clear(); this.asks.clear(); this.bookValid = true; }
    if (this.bookValid) {
      for (const [book, updates] of [[this.bids, delta.bids], [this.asks, delta.asks]] as const) {
        for (const [price, quantity] of updates) {
          if (!(Number.isFinite(price) && price > 0 && Number.isFinite(quantity) && quantity >= 0)) continue;
          if (quantity === 0) book.delete(price); else book.set(price, quantity);
        }
      }
      this.bookSequence = sequence;
      this.bookAt = Date.now();
    }
    this.emit('depth', delta);
  }

  /** A late subscriber needs a full book before receiving incremental deltas. */
  bookSnapshot(): RawDepthDelta | null {
    return this.bookValid && Date.now() - this.bookAt <= 5000
      ? { bids: [...this.bids], asks: [...this.asks], sequence: this.bookSequence, isSnapshot: true } : null;
  }

  private async initialize() {
    const { symbol, exchange, marketType } = this.instrument;
    const frames = [['1d', 80], ['4h', 100], ['1h', 100], ['15m', 80], ['5m', 80]] as const;
    const history = await Promise.all(frames.map(([tf, limit]) =>
      this.dependencies.klines(exchange, marketType, symbol, tf, limit).catch(() => [])));
    if (this.stopped) return;
    frames.forEach(([tf], i) => { if (history[i].length) this.candles.setCandles(tf, history[i]); });
    if (!this.price.price && history[3].length) this.price.price = history[3].at(-1)!.close;
    this.analysisTimer = setInterval(() => {
      // A timer can fire just before the cache's age reaches exactly 6000 ms.
      // Start a new shared analysis cycle so this never delays signals by a cycle.
      this.analysis = undefined;
      this.emit('tick');
    }, 6000);
    this.oiTimer = setInterval(() => void this.fetchOI(), 15_000);
    void this.fetchOI();
  }

  private async fetchOI() {
    if (this.stopped || this.oiPending) return;
    this.oiPending = true;
    try {
      const result = await this.dependencies.oi(this.instrument.symbol, this.instrument.baseAsset, this.price.price || 1);
      if (this.stopped) return;
      const value = result[this.instrument.exchange];
      if (value && value.valueUsd > 0) this.volume.recordOI(value.valueUsd, value.amountCoins, this.price.price);
    } catch { /* Keep the last measured OI; never synthesize missing data. */ }
    finally { this.oiPending = false; }
  }

  private calculate() {
    const price = this.price.price;
    const candles1d = this.candles.getCandles('1d'), candles4h = this.candles.getCandles('4h');
    const candles1h = this.candles.getCandles('1h'), candles15m = this.candles.getCandles('15m');
    const levelZones = this.levels.findSupportResistanceZones(candles1d, candles4h, candles1h);
    return { at: Date.now(), price, candles1h, candles15m, candles5m: this.candles.getCandles('5m'),
      structures: this.candles.getMultiTimeframeStructures(price), levelZones,
      thirdTouches: structuredClone(this.levels.trackThirdTouch(price, candles1h)),
      patterns: this.levels.detectFormations(candles1h, price),
      rvol: this.volume.calculateRVOL(candles15m).rvol,
      tradeFlow: this.volume.getTradeFlowSnapshot(), oiSnapshot: this.volume.getOISnapshot(price) };
  }

  getAnalysis() {
    if (this.stopped || this.price.price <= 0 || Date.now() - this.lastMarketPriceAt > 15_000) return null;
    if (!this.analysis || Date.now() - this.analysis.at >= 6000) this.analysis = this.calculate();
    return this.analysis;
  }

  destroy() {
    this.stopped = true;
    clearInterval(this.analysisTimer); clearInterval(this.oiTimer);
    this.stream.destroy(); this.removeAllListeners();
    this.bids.clear(); this.asks.clear(); this.analysis = undefined;
  }
}

export class SharedCoinMarketPool {
  private markets = new Map<string, { market: SharedCoinMarket; users: number }>();
  constructor(private dependencies = defaults) {}

  acquire(instrument: Instrument) {
    const symbol = normalizeExchangeSymbol(instrument.symbol);
    const key = `${instrument.exchange}:${instrument.marketType}:${symbol}`;
    let entry = this.markets.get(key);
    if (!entry) {
      entry = { market: new SharedCoinMarket({ ...instrument, symbol }, this.dependencies), users: 0 };
      this.markets.set(key, entry);
    }
    entry.users++;
    let released = false;
    return { market: entry.market, release: () => {
      if (released) return;
      released = true;
      if (--entry!.users === 0) { entry!.market.destroy(); this.markets.delete(key); }
    } };
  }
}

export const sharedCoinMarkets = new SharedCoinMarketPool();
