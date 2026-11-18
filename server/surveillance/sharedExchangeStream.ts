import type { ExchangeId, MarketType } from '../../src/types';
import { normalizeExchangeSymbol } from '../../src/utils/marketSymbols';
import { ExchangeStreamClient, type RawDepthDelta } from './exchangeStream';
import { ORDER_BOOK_MAX_AGE_MS, isFreshDepthTime, parseDepthLevels, type NormalizedDepthLevels } from '../../src/utils/orderBookValidation';

type Listener = (...args: any[]) => void;

/** Public price levels only. Personal density thresholds/history never enter
 * this view. Consumers must not mutate the shared maps. */
export interface SharedPublicOrderBook {
  readonly bids: ReadonlyMap<number, number>;
  readonly asks: ReadonlyMap<number, number>;
  readonly revision: number;
}

/** Public exchange ticker. No user settings or private data. */
export type SharedMarketTicker = {
  price: number;
  high24h: number;
  low24h: number;
  change24h: number;
  volume24hUsd: number;
  /** Time of last verified exchange quote/trade (milliseconds). */
  exchangeTime: number;
  /** Server reception clock; never refreshed by order-book heartbeats. */
  receivedAt: number;
};
type Entry = {
  key: string;
  source: ExchangeStreamClient;
  refs: number;
  lastResyncAt: number;
  lastErrorLoggedAt: number;
  ticker: SharedMarketTicker;
  bids: Map<number, number>;
  asks: Map<number, number>;
  depthSequence: number;
  depthEventTime: number;
  depthReceivedAt: number;
  depthRevision: number;
  /** The most recently validated public packet; never private user data. */
  normalizedDepth: {
    packet: RawDepthDelta;
    levels: NormalizedDepthLevels;
    book: SharedPublicOrderBook | null;
  } | null;
};

const entries = new Map<string, Entry>();
let isolatedStreamCounter = 0;

/**
 * Ref-count public exchange streams by instrument. Each consumer owns only its
 * listeners, so a user's worker can stop without tearing down the exchange
 * socket used by other users. No private user/alert data lives in this registry.
 */
export class SharedExchangeStreamHandle {
  private readonly entry: Entry;
  private readonly handlers: Array<[string, Listener]> = [];
  private disposed = false;

  constructor(symbol: string, exchange: ExchangeId, market: MarketType, depthOnly = false) {
    const cleanSymbol = normalizeExchangeSymbol(symbol);
    const baseKey = `${exchange}:${market}:${cleanSymbol}:${depthOnly ? 'depth' : 'full'}`;
    // Emergency rollback option for a rollout if consumers must use the
    // original one-source-per-worker behavior until a regression is fixed.
    const key = process.env.H00K_SHARED_STREAMS === '0'
      ? `${baseKey}:isolated:${++isolatedStreamCounter}` : baseKey;
    let entry = entries.get(key);
    if (!entry) {
      const source = new ExchangeStreamClient(cleanSymbol, exchange, market, depthOnly);
      // Do not issue a memory-leak warning for many legitimate subscribers.
      // The registry still drops each consumer's listeners at release time.
      source.setMaxListeners(0);
      entry = { key, source, refs: 0, lastResyncAt: 0, lastErrorLoggedAt: 0,
        ticker: { price: 0, high24h: 0, low24h: 0, change24h: 0, volume24hUsd: 0,
          exchangeTime: 0, receivedAt: 0 },
        bids: new Map(), asks: new Map(), depthSequence: 0, depthEventTime: 0, depthReceivedAt: 0,
        depthRevision: 0, normalizedDepth: null };
      entries.set(key, entry);
      // Maintain an instrument-level snapshot so a subscriber joining an
      // already-running WS can initialize its own book without reconnecting
      // or resetting the stream for every existing user.
      const shared = entry;
      // SharedCandleFeed may create the public socket before any CoinWorker
      // has registered an error listener. Node's EventEmitter throws on an
      // unhandled 'error', potentially terminating the entire h00k process.
      // Keep one lifetime-bound fallback listener per underlying connection.
      source.on('error', (error: unknown) => {
        // Log at most once per market/30s, regardless of how many owners
        // subscribe. This handler also prevents unhandled EventEmitter errors
        // while the stream is being created or has no consumers yet.
        const now = Date.now();
        if (now - shared.lastErrorLoggedAt < 30_000) return;
        shared.lastErrorLoggedAt = now;
        console.warn(`[SharedExchangeStream] ${shared.key}: public stream error:`,
          error instanceof Error ? error.message : 'unknown exchange stream error');
      });
      // Update price once per market rather than once for every owner.
      // Workers read the same public values but retain their own alert state.
      const acceptQuote = (price: number, eventTime: number): boolean => {
        const now = Date.now();
        // Do not fabricate a fresh quote from socket traffic, depth packets,
        // missing timestamps or an older cross-topic WS observation.
        if (!Number.isFinite(price) || price <= 0 ||
            !Number.isFinite(eventTime) || !isFreshDepthTime(eventTime, now) ||
            eventTime < shared.ticker.exchangeTime) return false;
        shared.ticker.price = price;
        shared.ticker.exchangeTime = eventTime;
        shared.ticker.receivedAt = now;
        return true;
      };
      let lastTurnoverTime = 0;
      const acceptTurnover = (amount: number, exchangeTime: number) => {
        const now = Date.now();
        if (!Number.isFinite(amount) || amount < 0 ||
            !Number.isFinite(exchangeTime) || !isFreshDepthTime(exchangeTime, now) ||
            exchangeTime < lastTurnoverTime) return;
        lastTurnoverTime = exchangeTime;
        shared.ticker.volume24hUsd = amount;
      };
      source.on('turnover24h', (sample: { volume24hUsd: number; time: number }) => {
        acceptTurnover(sample.volume24hUsd, sample.time);
      });
      source.on('price', (data: {
        price: number; high24h: number; low24h: number;
        volume24hUsd?: number; change24h?: number; time?: number;
      }) => {
        if (!acceptQuote(data.price, data.time!)) return;
        if (Number.isFinite(data.high24h) && data.high24h >= 0) shared.ticker.high24h = data.high24h;
        if (Number.isFinite(data.low24h) && data.low24h >= 0) shared.ticker.low24h = data.low24h;
        // Price-only deltas must not refresh the age of cached turnover.
        if (data.volume24hUsd !== undefined) acceptTurnover(data.volume24hUsd, data.time!);
        if (Number.isFinite(data.change24h)) shared.ticker.change24h = data.change24h!;
      });
      source.on('trade', (trade: { price: number; time?: number }) => {
        acceptQuote(trade.price, trade.time!);
      });
      source.on('status', (status: string) => {
        if (status !== 'LIVE') {
          // Preserve last known price for historical context, but invalidate
          // its realtime freshness immediately on disconnect/resync.
          shared.ticker.receivedAt = 0;
          // Do not reuse pre-disconnect turnover in an AUTO threshold.
          shared.ticker.volume24hUsd = 0;
          lastTurnoverTime = 0;
          shared.normalizedDepth = null;
          shared.depthRevision++;
          shared.depthSequence = 0;
          shared.depthReceivedAt = 0;
          shared.bids.clear(); shared.asks.clear();
        }
      });
      source.on('depth', (delta: RawDepthDelta) => {
        // Parse an exchange packet once per instrument, not once per owner.
        // Personal OrderBookEngine instances still verify sequence, time and
        // their own continuity before accepting these numeric levels.
        const bids = parseDepthLevels(delta.bids), asks = parseDepthLevels(delta.asks);
        const now = Date.now();
        const time = delta.eventTime ?? now;
        shared.normalizedDepth = null;
        if (!bids || !asks || !Number.isSafeInteger(delta.sequence) ||
            delta.sequence! <= 0 || !isFreshDepthTime(time, now)) {
          shared.depthSequence = 0;
          shared.depthReceivedAt = 0;
          shared.depthEventTime = 0;
          shared.depthRevision++;
          shared.bids.clear(); shared.asks.clear();
          return;
        }
        // Keep validated arrays available to synchronous per-owner listeners
        // of this exact EventEmitter packet. A new event replaces this record,
        // even if its object identity is reused by an upstream adapter.
        const validated: NonNullable<Entry['normalizedDepth']> = {
          packet: delta, levels: { bids, asks }, book: null,
        };
        shared.normalizedDepth = validated;
        // Cached data exists only for this synchronous EventEmitter fanout.
        // A delayed consumer or a reused/mutated upstream packet must parse
        // again rather than trust the previous event's numeric values.
        queueMicrotask(() => {
          if (shared.normalizedDepth === validated) shared.normalizedDepth = null;
        });
        // Never build a late-joiner's "fresh" snapshot by applying new
        // deltas to a stale pre-outage book. The source must re-snapshot first.
        if (shared.depthSequence > 0 &&
            (now - shared.depthReceivedAt > ORDER_BOOK_MAX_AGE_MS ||
             !isFreshDepthTime(shared.depthEventTime, now))) {
          shared.depthSequence = 0;
          shared.depthReceivedAt = 0;
          shared.depthEventTime = 0;
          shared.depthRevision++;
          shared.bids.clear(); shared.asks.clear();
          if (!delta.isSnapshot) return;
        }
        if (delta.isSnapshot) {
          shared.bids.clear(); shared.asks.clear();
        } else if (!shared.depthSequence || delta.sequence! <= shared.depthSequence) {
          return;
        }
        // The canonical public order book is maintained just once. Revisions
        // advance only for actual price/quantity changes, except full resets.
        let bookChanged = Boolean(delta.isSnapshot);
        for (const [p, q] of bids) {
          if ((shared.bids.get(p) ?? 0) !== q) bookChanged = true;
          q > 0 ? shared.bids.set(p, q) : shared.bids.delete(p);
        }
        for (const [p, q] of asks) {
          if ((shared.asks.get(p) ?? 0) !== q) bookChanged = true;
          q > 0 ? shared.asks.set(p, q) : shared.asks.delete(p);
        }
        if (bookChanged) shared.depthRevision++;
        shared.depthSequence = delta.sequence!;
        shared.depthEventTime = time;
        shared.depthReceivedAt = now;
        validated.book = {
          bids: shared.bids, asks: shared.asks, revision: shared.depthRevision,
        };
      });
    }
    entry.refs++;
    this.entry = entry;
  }

  get status() { return this.entry.source.status; }
  get marketTicker(): Readonly<SharedMarketTicker> { return this.entry.ticker; }
  /** A fresh quote alone is not enough: the associated public depth stream
   * must also have synchronized after any outage or reconnect. */
  hasFreshMarketQuote(maxAgeMs = 15_000): boolean {
    const ticker = this.entry.ticker;
    const now = Date.now();
    return !this.disposed && this.entry.source.status === 'LIVE' &&
      ticker.price > 0 && ticker.receivedAt > 0 &&
      ticker.exchangeTime > 0 && now >= ticker.receivedAt &&
      now - ticker.receivedAt <= maxAgeMs &&
      ticker.exchangeTime <= now + 1000 &&
      now - ticker.exchangeTime <= maxAgeMs;
  }

  /** Only synchronous listeners of the same validated source packet can
   * reuse the parsed numeric arrays. Replay and invalid packets are rechecked
   * normally by each book; no owner-specific state is shared.
   */
  validatedDepth(delta: RawDepthDelta): NormalizedDepthLevels | null {
    if (this.disposed) return null;
    const candidate = this.entry.normalizedDepth;
    return candidate?.packet === delta ? candidate.levels : null;
  }

  /** Returns the same canonical public maps for every owner of the market,
   * only during a valid, synchronized, synchronous exchange depth emission.
   * No stale/malformed packets or late subscriber replays receive this view.
   */
  sharedBook(delta: RawDepthDelta): SharedPublicOrderBook | null {
    if (this.disposed) return null;
    const candidate = this.entry.normalizedDepth;
    return candidate?.packet === delta ? candidate.book : null;
  }

  on(event: string, listener: Listener): this {
    if (this.disposed) return this;
    this.entry.source.on(event, listener);
    this.handlers.push([event, listener]);
    if (event === 'depth' && this.entry.depthSequence > 0) {
      const entry = this.entry;
      queueMicrotask(() => {
        if (this.disposed || !this.handlers.some(([type, fn]) => type === 'depth' && fn === listener) ||
            !entry.depthSequence || Date.now() - entry.depthReceivedAt > 5_000 ||
            !isFreshDepthTime(entry.depthEventTime) || !entry.bids.size || !entry.asks.size) return;
        listener({ isSnapshot: true, sequence: entry.depthSequence, eventTime: entry.depthEventTime,
          bids: [...entry.bids], asks: [...entry.asks] } satisfies RawDepthDelta);
      });
    }
    return this;
  }

  removeAllListeners(): this {
    for (const [event, listener] of this.handlers) this.entry.source.removeListener(event, listener);
    this.handlers.length = 0;
    return this;
  }

  /** Multiple users noticing the same order-book gap must request one resync. */
  resyncOrderBook() {
    if (this.disposed) return;
    const now = Date.now();
    if (now - this.entry.lastResyncAt < 1_000) return;
    this.entry.lastResyncAt = now;
    this.entry.source.resyncOrderBook();
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.removeAllListeners();
    if (--this.entry.refs === 0 && entries.get(this.entry.key) === this.entry) {
      entries.delete(this.entry.key);
      this.entry.source.destroy();
    }
  }
}

export function acquireExchangeStream(symbol: string, exchange: ExchangeId,
  market: MarketType, depthOnly = false): SharedExchangeStreamHandle {
  return new SharedExchangeStreamHandle(symbol, exchange, market, depthOnly);
}

export function getSharedExchangeStreamStats() {
  return Array.from(entries.values(), entry => ({ scope: entry.key, subscribers: entry.refs }));
}
