import type { ExchangeId, Kline, MarketType } from '../../types';
import { subscribeMarketTrades, type AggressiveMarketTrade } from './marketTradeStream';

export const TERMINAL_5S_MS = 5_000;
const MAX_BARS = 2_884;
const PUBLISH_MS = 250;

type Scope = { exchange: ExchangeId; marketType: MarketType; symbol: string };
type Listener = (candles: Kline[]) => void;
type StatusListener = (connected: boolean) => void;

/**
 * Trade-derived 5s OHLCV. Never split a 1m bar: that would invent its
 * high/low/volume. The first bucket in a REST seed can be truncated, so it
 * must never be displayed. All following buckets are built from public trades.
 * Missing time buckets remain gaps instead of manufactured flat candles.
 */
export class TerminalFiveSecondAccumulator {
  private bars: Kline[] = [];
  private firstBucket: number | null = null;
  private lastTradeAt = 0;

  reset(): void {
    this.bars = [];
    this.firstBucket = null;
    this.lastTradeAt = 0;
  }

  accept(trade: AggressiveMarketTrade): boolean {
    if (!Number.isFinite(trade.t) || !Number.isFinite(trade.p) ||
        !Number.isFinite(trade.usd) || trade.t <= 0 ||
        trade.p <= 0 || trade.usd <= 0 ||
        (trade.side !== 'BUY' && trade.side !== 'SELL')) return false;
    // Preserve exchange trade order even for equal-time or same-bucket trades.
    if (this.lastTradeAt && trade.t < this.lastTradeAt) return false;
    // No trades for five seconds can be entirely legitimate on an illiquid coin.
    // Keep its older real bars and leave the empty UTC intervals blank; only
    // a confirmed WebSocket interruption invalidates the history.
    const startMs = Math.floor(trade.t / TERMINAL_5S_MS) * TERMINAL_5S_MS;
    this.firstBucket ??= startMs;
    const t = startMs / 1000;
    const quantity = trade.usd / trade.p;
    if (!Number.isFinite(quantity) || quantity <= 0) return false;
    const buyVolume = trade.side === 'BUY' ? quantity : 0;
    const last = this.bars[this.bars.length - 1];
    if (!last || last.time < t) {
      this.bars.push({
        time: t, open: trade.p, high: trade.p, low: trade.p, close: trade.p,
        volume: quantity, buyVolume, quoteVolume: trade.usd,
        buyQuoteVolume: trade.side === 'BUY' ? trade.usd : 0,
      });
      // The warmup bucket eventually falls out of the ring; cap visible bars too.
      if (this.bars.length > MAX_BARS) this.bars.shift();
    } else if (last.time === t) {
      // Mutate only the internal current bar, never a published React snapshot.
      last.high = Math.max(last.high, trade.p);
      last.low = Math.min(last.low, trade.p);
      last.close = trade.p;
      last.volume += quantity;
      last.buyVolume = (last.buyVolume ?? 0) + buyVolume;
      last.quoteVolume = (last.quoteVolume ?? 0) + trade.usd;
      last.buyQuoteVolume = (last.buyQuoteVolume ?? 0) +
        (trade.side === 'BUY' ? trade.usd : 0);
    } else return false;
    this.lastTradeAt = trade.t;
    return true;
  }

  snapshot(): Kline[] {
    if (this.firstBucket === null) return [];
    const firstCompleteBucket = this.firstBucket + TERMINAL_5S_MS;
    return this.bars
      .filter(bar => bar.time * 1000 >= firstCompleteBucket)
      .map(bar => ({ ...bar }));
  }
}

type SharedFeed = {
  listeners: Set<Listener>;
  statusListeners: Map<Listener, StatusListener>;
  transportConnected: boolean;
  connected: boolean;
  accumulator: TerminalFiveSecondAccumulator;
  stop: () => void;
  publishTimer: ReturnType<typeof setTimeout> | null;
  releaseTimer: ReturnType<typeof setTimeout> | null;
};
/** Injectable subscription source makes WS lifecycle and integrity unit-testable. */
export function createTerminalFiveSecondSubscriptions(subscribeTrades: typeof subscribeMarketTrades = subscribeMarketTrades) {
const sharedFeeds = new Map<string, SharedFeed>();

/** A single trade subscription and bounded in-tab 5s cache per market scope.
 * Multiple Terminal cards share one aggregation; no server-side 5s scan runs.
 */
function subscribeTerminalFiveSecondCandles(scope: Scope, listener: Listener, onStatus?: StatusListener): () => void {
  const key = [scope.exchange, scope.marketType, scope.symbol.toUpperCase()].join(':');
  let feed = sharedFeeds.get(key);
  if (!feed) {
    const created: SharedFeed = {
      listeners: new Set(), statusListeners: new Map(),
      transportConnected: false, connected: false,
      accumulator: new TerminalFiveSecondAccumulator(),
      stop: () => {}, publishTimer: null, releaseTimer: null,
    };
    sharedFeeds.set(key, created);
    const publish = () => {
      if (created.publishTimer) return;
      created.publishTimer = setTimeout(() => {
        created.publishTimer = null;
        const candles = created.accumulator.snapshot();
        for (const subscriber of [...created.listeners]) {
          try { subscriber(candles); } catch { /* other charts stay live */ }
        }
      }, PUBLISH_MS);
    };
    let verified = true;
    const updateStatus = () => {
      const next = created.transportConnected && verified;
      if (next === created.connected) return;
      created.connected = next;
      for (const callback of [...created.statusListeners.values()]) {
        try { callback(next); } catch { /* other cards stay live */ }
      }
    };
    created.stop = subscribeTrades(scope, {
      wantsPrints: () => false,
      onPrints: () => {},
      onTransportStatus: connected => {
        created.transportConnected = connected;
        updateStatus();
      },
      onTrade: trade => {
        // Gap recovery is not complete: never claim partial executions as full OHLCV.
        if (verified && created.accumulator.accept(trade)) publish();
      },
      onStreamInterrupted: () => {
        // Direct exchange WebSockets do not guarantee a trade gap can be
        // backfilled. Do not accept even REST seed replay until a genuine
        // post-reconnect market trade has arrived on the live socket.
        verified = false;
        created.accumulator.reset();
        updateStatus();
        publish();
      },
      onStreamResumed: () => {
        if (verified) return;
        verified = true;
        created.accumulator.reset();
        updateStatus();
        publish();
      },
      onIntegrity: status => {
        const nowVerified = status === 'verified';
        if (verified === nowVerified) return;
        verified = nowVerified;
        created.accumulator.reset();
        updateStatus();
        publish();
      },
    });
    feed = created;
  }
  const active = feed;
  if (active.releaseTimer) {
    clearTimeout(active.releaseTimer);
    active.releaseTimer = null;
  }
  active.listeners.add(listener);
  if (onStatus) {
    active.statusListeners.set(listener, onStatus);
    try { onStatus(active.connected); } catch { /* isolate status consumers */ }
  }
  try { listener(active.accumulator.snapshot()); } catch { /* a failing view cannot leak its feed */ }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    active.listeners.delete(listener);
    active.statusListeners.delete(listener);
    if (!active.listeners.size) {
      active.releaseTimer = setTimeout(() => {
        if (active.listeners.size || sharedFeeds.get(key) !== active) return;
        if (active.publishTimer) clearTimeout(active.publishTimer);
        active.stop();
        sharedFeeds.delete(key);
      }, 1_500);
    }
  };
}

const activeFeeds = () => sharedFeeds.size;
return { subscribe: subscribeTerminalFiveSecondCandles, activeFeeds };
}

const browserFiveSecondFeeds = createTerminalFiveSecondSubscriptions();
export const subscribeTerminalFiveSecondCandles = browserFiveSecondFeeds.subscribe;
export const activeTerminalFiveSecondFeeds = browserFiveSecondFeeds.activeFeeds;
