import type { ExchangeId, MarketType } from '../../types';
import { adaptiveCut, type MarketPrint } from './marketAnalytics';
import { fetchMarketTradeSeedJson } from './marketTradeSeed';
import { marketStreamIdleRelease } from './marketStreamIdleRelease';
import { createSharedBinanceTradeTransport, type BinanceTradePacket } from './binanceSharedTradeTransport';
import { openSharedBinanceTradeSocket } from './binanceSharedTradeSocket';
import { createVerifiedBinanceTrades } from './verifiedBinanceTrades';
import { isValidExchangeSymbol, normalizeExchangeSymbol } from '../../utils/marketSymbols';

/** One public-trade transport and one adaptive threshold per exchange/market/symbol per browser tab. */
export type MarketTrade = { id: string; t: number; p: number; q: number; side: 'BUY' | 'SELL' };
export type AggressiveMarketTrade = { id: string; t: number; p: number; usd: number; side: 'BUY' | 'SELL' };
type Listener = { onTrade: (trade: AggressiveMarketTrade) => void; onPrints: (prints: MarketPrint[]) => void; wantsPrints?: () => boolean; liveOnly?: boolean; onIntegrity?: (status: 'verified' | 'recovering' | 'incomplete') => void; /** A direct WebSocket was interrupted, so a trade-derived 30s bar might have missed executions. */ onStreamInterrupted?: () => void; /** First valid live trade after a direct WS reconnect. */ onStreamResumed?: () => void; /** True only while an actual exchange trade subscription is active. */ onTransportStatus?: (connected: boolean) => void };
type Burst = {
  id: string; side: 'BUY' | 'SELL'; start: number; last: number;
  usd: number; count: number;
  // Keep each second's price × notional independently. A burst can cross a
  // second boundary, and reusing its overall average misprices both buckets.
  seconds: Map<number, {
    usd: number; priceUsd: number; count: number;
    accountedUsd: number; accountedPriceUsd: number; accountedCount: number;
  }>;
};

const BINANCE_FUTURES_API = 'https://fapi.binance.com';
const BINANCE_SPOT_APIS = ['https://data-api.binance.vision', 'https://api.binance.com'];
const BYBIT_API = 'https://api.bybit.com';
const BINANCE_FUTURES_WS = 'wss://fstream.binance.com/market/ws';
const BINANCE_SPOT_WS = 'wss://stream.binance.com:9443/ws';
const BYBIT_WS = {
  futures: 'wss://stream.bybit.com/v5/public/linear',
  spot: 'wss://stream.bybit.com/v5/public/spot',
} as const;
const MAX_SAMPLE = 8192;
const MAX_SEEN = 30000;
const PRINT_HISTORY_MS = 60 * 60_000;
const MAX_PRINT_SECONDS = 7200;
const WS_CONNECT_TIMEOUT_MS = 15_000;
const BYBIT_HEARTBEAT_INTERVAL_MS = 20_000;
const BYBIT_HEARTBEAT_STALE_MS = 60_000;

/** Exponential retry with per-browser jitter, to prevent mass reconnect bursts. */
export function marketTradeReconnectDelay(attempt: number, randomValue = Math.random()): number {
  const exponent = Number.isFinite(attempt) ? Math.max(0, Math.min(4, Math.floor(attempt))) : 0;
  const base = Math.min(20_000, 1000 * 2 ** exponent);
  const fraction = Number.isFinite(randomValue) ? Math.max(0, Math.min(1, randomValue)) : 0;
  return base + Math.floor(fraction * Math.min(1000, base));
}

/** Pure accumulator: skips overlapping REST/WS trade IDs before volume or threshold calculations. */
export class LargeMarketTradeTracker {
  private seen = new Map<string, number>();
  private seenPruneAt = 0;
  private sample: Array<{ t: number; usd: number }> = [];
  private sampleHead = 0;
  private active: Burst | null = null;
  private prints = new Map<string, MarketPrint>();
  private cut = 0;
  private cutAt = 0;
  // Reuse the same immutable-by-convention array while no print changes.
  // This avoids sorting the full hour of markers for every Terminal chart
  // mount and prevents redundant React state updates for identical data.
  private cachedSnapshot: {
    revision: number; expiresAt: number; rows: MarketPrint[];
  } | null = null;
  revision = 0;

  get thresholdUsd() { return this.cut; }

  seedThreshold(rows: readonly MarketTrade[]) {
    const notionals = rows.filter(trade => trade.p > 0 && trade.q > 0)
      .map(trade => trade.p * trade.q).filter(Number.isFinite);
    if (notionals.length) {
      this.cut = adaptiveCut(notionals, .95, .995, 2.8);
      this.cutAt = Math.max(...rows.map(row => row.t).filter(Number.isFinite), 0);
    }
  }

  private commit() {
    const burst = this.active;
    if (!burst || !this.cut || burst.usd < this.cut) return;
    // Preserve *all* qualifying volume in per-second accumulators, not only
    // the last 40 individual bursts (which made busy BTC candles undercount).
    for (const [second, segment] of burst.seconds) {
      const delta = segment.usd - segment.accountedUsd;
      const countDelta = segment.count - segment.accountedCount;
      if (delta <= 0) continue;
      const id = burst.side + ':' + second;
      const previous = this.prints.get(id);
      const newUsd = (previous?.usd || 0) + delta;
      // Only newly added trades contribute to the incremental VWAP. Using
      // the whole burst's average here would retroactively distort earlier
      // seconds, and even earlier trades within the same second.
      const deltaPriceUsd = segment.priceUsd - segment.accountedPriceUsd;
      const item: MarketPrint = {
        id, side: burst.side, t: second,
        p: previous ? (previous.p * previous.usd + deltaPriceUsd) / newUsd : deltaPriceUsd / delta,
        usd: newUsd, count: (previous?.count || 0) + countDelta,
        touches: 1, lastTouch: burst.last,
        score: Math.min(100, Math.round(100 * newUsd / Math.max(1, this.cut * 2))),
      };
      this.prints.set(id, item);
      segment.accountedUsd = segment.usd;
      segment.accountedPriceUsd = segment.priceUsd;
      segment.accountedCount = segment.count;
      this.revision++;
    }
    // Bound the lifetime and memory of accumulated second buckets.
    while (this.prints.size > MAX_PRINT_SECONDS) this.prints.delete(this.prints.keys().next().value!);
  }

  accept(trade: MarketTrade): AggressiveMarketTrade | null {
    if (!trade.id || !Number.isFinite(trade.t) || !Number.isFinite(trade.p) ||
        !Number.isFinite(trade.q) || trade.p <= 0 || trade.q <= 0 ||
        (trade.side !== 'BUY' && trade.side !== 'SELL')) return null;
    // The exchange trade ID is unique within a symbol; never count its REST/WS replay twice.
    if (this.seen.has(trade.id)) return null;
    const usd = trade.p * trade.q;
    if (!Number.isFinite(usd) || usd <= 0) return null;
    this.seen.set(trade.id, trade.t);
    if (trade.t - this.seenPruneAt > 15_000) {
      const oldest = trade.t - 300_000;
      for (const [id, t] of this.seen) if (t < oldest) this.seen.delete(id);
      this.seenPruneAt = trade.t;
    }
    // Trim only the excess IDs: scanning all 30k IDs on every BTC trade
    // would be more expensive than the shared socket was meant to save.
    while (this.seen.size > MAX_SEEN) this.seen.delete(this.seen.keys().next().value!);
    this.sample.push({ t: trade.t, usd });
    const windowStart = trade.t - 120_000;
    while (this.sampleHead < this.sample.length &&
      (this.sampleHead < this.sample.length - MAX_SAMPLE ||
        this.sample[this.sampleHead].t < windowStart)) this.sampleHead++;
    // Compact in blocks, not an 8192-element copy for every busy BTC tick.
    if (this.sampleHead > 1024) {
      this.sample = this.sample.slice(this.sampleHead);
      this.sampleHead = 0;
    }
    if (!this.cut || trade.t - this.cutAt > 3000) {
      this.cut = adaptiveCut(this.sample.slice(this.sampleHead).map(row => row.usd), .95, .995, 2.8);
      this.cutAt = trade.t;
    }
    const second = Math.floor(trade.t / 1000) * 1000;
    if (!this.active || this.active.side !== trade.side ||
        trade.t - this.active.last > 450 || trade.t - this.active.start > 1400) {
      this.commit();
      this.active = {
        id: trade.side + ':' + trade.t + ':' + trade.id,
        side: trade.side, start: trade.t, last: trade.t,
        usd, count: 1,
        seconds: new Map([[second, {
          usd, priceUsd: trade.p * usd, count: 1,
          accountedUsd: 0, accountedPriceUsd: 0, accountedCount: 0,
        }]]),
      };
    } else {
      this.active.last = trade.t;
      this.active.usd += usd;
      this.active.count++;
      const segment = this.active.seconds.get(second) || {
        usd: 0, priceUsd: 0, count: 0,
        accountedUsd: 0, accountedPriceUsd: 0, accountedCount: 0,
      };
      segment.usd += usd;
      segment.priceUsd += trade.p * usd;
      segment.count++;
      this.active.seconds.set(second, segment);
    }
    // Publish the same group ID with its updated total, never append a second copy.
    this.commit();
    return { id: trade.id, t: trade.t, p: trade.p, usd, side: trade.side };
  }

  snapshot(now = Date.now()): MarketPrint[] {
    const cached = this.cachedSnapshot;
    if (cached && cached.revision === this.revision && now <= cached.expiresAt)
      return cached.rows;
    const cutoff = now - PRINT_HISTORY_MS;
    for (const [id, item] of this.prints) if (item.t < cutoff) this.prints.delete(id);
    const rows = [...this.prints.values()].sort((a, b) => a.t - b.t);
    // Prune when the earliest row first falls *outside* the one-hour window.
    // Without an expiry bound, a quiet market would keep old marks forever.
    const expiresAt = rows.length ? rows[0].t + PRINT_HISTORY_MS : Infinity;
    this.cachedSnapshot = { revision: this.revision, expiresAt, rows };
    return rows;
  }
}

type FeedScope = { exchange: ExchangeId; marketType: MarketType; symbol: string };

// Share Binance public aggTrade by default where Web Locks + BroadcastChannel
// are available. Setting VITE_H00K_SHARED_BINANCE_TRADES=0 at BUILD time
// restores the original per-tab exchange connection without changing Bybit.
const shouldUseBinanceTradeRelay = (scope: FeedScope): boolean =>
  import.meta.env?.VITE_H00K_SHARED_BINANCE_TRADES !== '0' &&
  typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol) &&
  typeof BroadcastChannel !== 'undefined' &&
  typeof navigator !== 'undefined' && !!navigator.locks?.request &&
  scope.exchange === 'binance' &&
  isValidExchangeSymbol(normalizeExchangeSymbol(scope.symbol));
let binanceRelay: ReturnType<typeof createSharedBinanceTradeTransport> | null = null;
function getBinanceRelay() {
  binanceRelay ||= createSharedBinanceTradeTransport({
    channel: name => new BroadcastChannel(name),
    lock: async (name, signal, task) =>
      await navigator.locks.request(name, { mode: 'exclusive', signal }, task),
    socket: openSharedBinanceTradeSocket,
  });
  return binanceRelay;
}

const marketStreams = new Map<string, SharedMarketTradeStream>();
const scopeKey = ({ exchange, marketType, symbol }: FeedScope) =>
  exchange + ':' + marketType + ':' + symbol.toUpperCase();

class SharedMarketTradeStream {
  readonly tracker = new LargeMarketTradeTracker();
  readonly listeners = new Set<Listener>();
  started = false;
  private recent: AggressiveMarketTrade[] = [];
  private recentHead = 0;
  private socket: WebSocket | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private connectDeadline: ReturnType<typeof setTimeout> | null = null;
  private publishTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private directRecoveryPending = false;
  private transportConnected = false;
  private lastDirectGapAt = 0;
  private pending: MarketTrade[] = [];
  private buffering = true;
  private liveWithoutSeed = false;
  private stopped = false;
  private retries = 0;
  private abort = new AbortController();
  private betaStop: (() => void) | null = null;
  private betaVerifier: ReturnType<typeof createVerifiedBinanceTrades> | null = null;
  private betaTransportConnected = false;
  private betaPreseed: BinanceTradePacket[] = [];
  integrity: 'verified' | 'recovering' | 'incomplete' = 'verified';

  constructor(readonly scope: FeedScope) {}

  private setTransportConnected(connected: boolean) {
    if (this.transportConnected === connected) return;
    this.transportConnected = connected;
    for (const listener of [...this.listeners]) {
      try { listener.onTransportStatus?.(connected); } catch { /* isolate chart */ }
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    try { listener.onIntegrity?.(this.integrity); } catch {}
    try { listener.onTransportStatus?.(this.transportConnected); } catch {}
    // A new Terminal card attaching while this socket is reconnecting must
    // not replay old prints as though the missing trade interval were complete.
    const interrupted = this.directRecoveryPending;
    if (interrupted) {
      try { listener.onStreamInterrupted?.(); } catch {}
    }
    if (!listener.liveOnly && this.integrity !== 'incomplete' &&
        (!interrupted || !listener.onStreamInterrupted)) {
      // Even after the new socket becomes live, never replay old pre-outage
      // executions into a newly mounted trade-derived Terminal 30s chart.
      const cutoff = Math.max(Date.now() - 300_000,
        listener.onStreamInterrupted ? this.lastDirectGapAt : 0);
      for (let i = this.recentHead; i < this.recent.length; i++) {
        const trade = this.recent[i];
        if (trade.t >= cutoff &&
            (!listener.onStreamInterrupted || !this.lastDirectGapAt ||
             trade.t > this.lastDirectGapAt)) {
          // One chart's callback must not break replay for a newly mounted
          // Terminal chart or leave it registered without a cleanup handle.
          try { listener.onTrade(trade); } catch { /* isolate faulty chart */ }
        }
      }
    }
    try {
      if (listener.wantsPrints?.() !== false) listener.onPrints(this.integrity === 'verified' ? this.tracker.snapshot() : []);
    } catch { /* an unavailable chart must not interrupt the shared feed */ }
    return () => this.listeners.delete(listener);
  }

  private publish() {
    if (this.publishTimer || this.stopped ||
        ![...this.listeners].some(listener => {
          try { return listener.wantsPrints?.() !== false; } catch { return false; }
        })) return;
    // One bounded update per 500ms per coin, and none when all charts hide the labels.
    this.publishTimer = setTimeout(() => {
      this.publishTimer = null;
      if (this.stopped) return;
      const watching = [...this.listeners].filter(listener => {
        try { return listener.wantsPrints?.() !== false; } catch { return false; }
      });
      if (!watching.length) return;
      const prints = this.integrity === 'verified' ? this.tracker.snapshot() : [];
      for (const listener of watching) {
        try { listener.onPrints(prints); } catch { /* keep other charts updating */ }
      }
    }, 500);
  }

  private accept(trade: MarketTrade, fromHistory = false) {
    const revision = this.tracker.revision;
    const accepted = this.tracker.accept(trade);
    if (!accepted) return;
    this.recent.push(accepted);
    if (this.recent.length - this.recentHead > 2500) this.recentHead++;
    if (this.recentHead > 512) {
      this.recent = this.recent.slice(this.recentHead);
      this.recentHead = 0;
    }
    for (const listener of [...this.listeners]) {
      if (fromHistory && listener.liveOnly) continue;
      try { listener.onTrade(accepted); } catch { /* isolate faulty chart */ }
    }
    if (revision !== this.tracker.revision) this.publish();
  }

  private receive(trade: MarketTrade) {
    if (this.stopped) return;
    if (this.buffering) {
      this.pending.push(trade);
      if (this.pending.length > 20000) {
        // A slow REST seed must never silently discard live execution amounts.
        // Fall back to the already-buffered WS events and disregard the stale
        // REST response when it eventually arrives.
        this.liveWithoutSeed = true;
        const buffered = this.pending.sort((a, b) => a.t - b.t);
        this.pending = [];
        this.buffering = false;
        for (const item of buffered) this.accept(item);
      }
    } else this.accept(trade);
  }

  async start() {
    if (shouldUseBinanceTradeRelay(this.scope)) {
      try {
        const scope = this.scope;
        const endpoint = scope.marketType === 'futures' ? '/fapi/v1/aggTrades' : '/api/v3/aggTrades';
        const hosts = scope.marketType === 'futures' ? [BINANCE_FUTURES_API] : BINANCE_SPOT_APIS;
        this.betaVerifier = createVerifiedBinanceTrades({
          accept: trade => this.receive(trade),
          load: async (fromId, limit, signal) => {
            const path = endpoint + '?symbol=' + encodeURIComponent(scope.symbol) +
              '&fromId=' + fromId + '&limit=' + limit;
            for (const host of hosts) {
              try {
                const response = await fetchMarketTradeSeedJson(host + path, signal);
                if (!Array.isArray(response)) throw new Error('Missing aggregate trades');
                return response;
              } catch (error) {
                if (signal.aborted || host === hosts[hosts.length - 1]) throw error;
              }
            }
            return [];
          },
          maxPages: 2,
          maxBuffered: 3000,
          onIntegrity: status => {
            this.integrity = status;
            // Relay's verifier owns its subscription health. The direct
            // exchange sockets use onopen/Bybit subscribe acknowledgements.
            this.setTransportConnected(status === 'verified' && this.betaTransportConnected);
            if (status === 'incomplete') {
              // Never advertise unverified large-trade prints as trustworthy.
              for (const listener of [...this.listeners]) {
                try { listener.onPrints([]); } catch {}
              }
            }
            for (const listener of [...this.listeners]) {
              try { listener.onIntegrity?.(status); } catch {}
            }
          },
        });
        this.betaStop = getBinanceRelay().subscribe(
          { marketType: scope.marketType, symbol: scope.symbol },
          trade => {
            if (this.stopped) return;
            if (this.buffering) {
              // First confirm the REST seed, then replay queued WS/peer IDs
              // through the exact-gap validator before any derived statistics.
              if (this.betaPreseed.length >= 20000) {
                this.betaVerifier?.close();
                this.integrity = 'incomplete';
                for (const listener of [...this.listeners]) {
                  try { listener.onIntegrity?.('incomplete'); listener.onPrints([]); } catch {}
                }
                return;
              }
              this.betaPreseed.push(trade);
            } else this.betaVerifier?.push(trade);
          },
          connected => {
            if (this.stopped) return;
            this.betaTransportConnected = connected;
            this.setTransportConnected(connected && this.integrity === 'verified');
          },
        );
      } catch {
        this.betaStop?.();
        this.betaStop = null;
        this.betaTransportConnected = false;
        this.betaVerifier?.close();
        this.betaVerifier = null;
        // Unsupported/blocked browser IPC falls back to the unchanged feed.
        this.connect();
      }
    } else this.connect();
    let history: MarketTrade[] = [];
    try {
      const { exchange, marketType, symbol } = this.scope;
      if (exchange === 'binance') {
        const path = (marketType === 'futures' ? '/fapi/v1/aggTrades' : '/api/v3/aggTrades') +
          '?symbol=' + encodeURIComponent(symbol) + '&limit=1000';
        const hosts = marketType === 'futures' ? [BINANCE_FUTURES_API] : BINANCE_SPOT_APIS;
        for (const host of hosts) {
          try {
            const data = await fetchMarketTradeSeedJson(host + path, this.abort.signal);
            history = (Array.isArray(data) ? data : []).map((row: any) => ({
              t: Number(row.T), p: Number(row.p), q: Number(row.q),
              side: row.m ? 'SELL' : 'BUY', id: String(row.a ?? ''),
            }));
            break;
          } catch (error) {
            if (this.abort.signal.aborted) throw error;
          }
        }
      } else {
        const category = marketType === 'futures' ? 'linear' : 'spot';
        const url = BYBIT_API + '/v5/market/recent-trade?category=' + category +
          '&symbol=' + encodeURIComponent(symbol) + '&limit=1000';
        const data = await fetchMarketTradeSeedJson(url, this.abort.signal);
        history = (data?.result?.list || []).map((row: any) => ({
          t: Number(row.time), p: Number(row.price), q: Number(row.size),
          side: String(row.side).toLowerCase() === 'sell' ? 'SELL' : 'BUY',
          id: String(row.execId ?? ''),
        }));
      }
    } catch {
      // A temporary REST failure must not prevent the live public-trade stream.
    }
    if (this.stopped || this.liveWithoutSeed) return;
    history.sort((a, b) => a.t - b.t);
    this.tracker.seedThreshold(history);
    // REST and WebSocket overlap by design; merge in time order and deduplicate by trade ID.
    const combined = [
      ...history.map(trade => ({ trade, fromHistory: true })),
      ...this.pending.map(trade => ({ trade, fromHistory: false })),
    ].sort((a, b) => a.trade.t - b.trade.t);
    this.pending = [];
    for (const { trade, fromHistory } of combined) this.accept(trade, fromHistory);
    this.buffering = false;
    if (this.betaVerifier) {
      const lastSeedId = Math.max(-1, ...history.map(trade => Number(trade.id)).filter(Number.isSafeInteger));
      if (lastSeedId >= 0) this.betaVerifier.prime(lastSeedId);
      const waiting = this.betaPreseed.sort((a, b) => Number(a.id) - Number(b.id));
      this.betaPreseed = [];
      for (const trade of waiting) this.betaVerifier.push(trade);
    }
  }

  private receiveDirect(trade: MarketTrade) {
    if (this.directRecoveryPending && trade.id && trade.id !== 'undefined' &&
        Number.isFinite(trade.t) && trade.t > 0 &&
        Number.isFinite(trade.p) && trade.p > 0 &&
        Number.isFinite(trade.q) && trade.q > 0) {
      this.directRecoveryPending = false;
      for (const listener of [...this.listeners]) {
        try { listener.onStreamResumed?.(); } catch { /* isolate chart */ }
      }
    }
    this.receive(trade);
  }

  private connect() {
    if (this.stopped) return;
    const { exchange, marketType, symbol } = this.scope;
    try {
      const ws = exchange === 'binance'
        ? new WebSocket((marketType === 'futures' ? BINANCE_FUTURES_WS : BINANCE_SPOT_WS) +
          '/' + encodeURIComponent(symbol.toLowerCase()) + '@aggTrade')
        : new WebSocket(BYBIT_WS[marketType]);
      this.socket = ws;
      // A socket that opens but closes immediately is not a successful
      // recovery. Preserve exponential backoff until the connection has
      // remained established for a meaningful interval.
      let openedAt = 0;
      let lastBybitResponseAt = 0;
      ws.onopen = () => {
        if (this.stopped || this.socket !== ws || this.reconnectTimer) return;
        openedAt = Date.now();
        if (this.connectDeadline) { clearTimeout(this.connectDeadline); this.connectDeadline = null; }
        if (exchange === 'binance') this.setTransportConnected(true);
        if (exchange !== 'binance') {
          lastBybitResponseAt = openedAt;
          try {
            ws.send(JSON.stringify({ op: 'subscribe', args: ['publicTrade.' + symbol] }));
          } catch {
            // A failed subscription is not a healthy open market feed.
            try { ws.close(); } catch {}
            reconnect();
            return;
          }
          this.ping = setInterval(() => {
            if (this.stopped || this.socket !== ws || this.reconnectTimer) return;
            // Bybit acknowledges application-level pings even when an
            // illiquid market has no trades. Silence from the server despite
            // outgoing pings indicates a half-open transport.
            if (ws.readyState !== WebSocket.OPEN ||
                Date.now() - lastBybitResponseAt >= BYBIT_HEARTBEAT_STALE_MS) {
              reconnect();
              return;
            }
            try { ws.send(JSON.stringify({ op: 'ping' })); }
            catch { reconnect(); }
          }, BYBIT_HEARTBEAT_INTERVAL_MS);
        }
      };
      ws.onmessage = event => {
        if (this.stopped || this.socket !== ws || this.reconnectTimer) return;
        try {
          const data = JSON.parse(event.data);
          if (!data || typeof data !== 'object') return;
          if (exchange === 'binance') {
            this.receiveDirect({
              t: Number(data.T), p: Number(data.p), q: Number(data.q),
              side: data.m ? 'SELL' : 'BUY', id: String(data.a ?? ''),
            });
          } else if (data.op === 'subscribe' && data.success === false) {
            // Do not treat a rejected subscription as a healthy open socket.
            reconnect();
          } else if (data.op === 'subscribe' && data.success === true &&
                     (!Array.isArray(data.args) || data.args.includes('publicTrade.' + symbol))) {
            lastBybitResponseAt = Date.now();
            this.setTransportConnected(true);
          } else if (data.op === 'pong' ||
                     (data.op === 'ping' && data.success !== false &&
                       (data.ret_msg === 'pong' || data.retMsg === 'pong'))) {
            lastBybitResponseAt = Date.now();
          } else if (data.topic === 'publicTrade.' + symbol && Array.isArray(data.data)) {
            // A genuine market frame is also proof of a working transport.
            lastBybitResponseAt = Date.now();
            this.setTransportConnected(true);
            const trades: MarketTrade[] = data.data.map((row: any) => ({
              t: Number(row.T), p: Number(row.p), q: Number(row.v),
              side: String(row.S).toLowerCase() === 'sell' ? 'SELL' : 'BUY',
              id: String(row.i ?? ''),
            }));
            trades.sort((a, b) => a.t - b.t);
            for (const trade of trades) this.receiveDirect(trade);
          }
        } catch {}
      };
      const reconnect = () => {
        // A late close/error from an older socket must NEVER cancel the
        // heartbeat belonging to the already established replacement.
        if (this.stopped || this.socket !== ws || this.reconnectTimer) return;
        this.setTransportConnected(false);
        // Regular Binance/Bybit trade sockets do not backfill missed WS
        // executions on reconnect. Preserve the recovery state even after
        // the retry timer expires while its replacement socket connects.
        this.directRecoveryPending = true;
        this.lastDirectGapAt = Date.now();
        // Invalidate only dependent 30s OHLCV;
        // other trade listeners keep their existing market-print behavior.
        for (const listener of [...this.listeners]) {
          try { listener.onStreamInterrupted?.(); } catch { /* isolate chart */ }
        }
        if (this.ping) { clearInterval(this.ping); this.ping = null; }
        if (this.connectDeadline) { clearTimeout(this.connectDeadline); this.connectDeadline = null; }
        // Only a stable connection resets the retry budget. Otherwise an
        // exchange that briefly accepts then drops connections would induce
        // a permanent one-second reconnect storm across Terminal coins.
        if (openedAt > 0 && Date.now() - openedAt >= 30_000) this.retries = 0;
        const delay = marketTradeReconnectDelay(this.retries++);
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.connect();
        }, delay);
        // Browsers do not guarantee that close/error follows a half-open
        // socket. Initiate shutdown ourselves; the late close is idempotent.
        try { ws.close(); } catch {}
      };
      ws.onerror = reconnect;
      ws.onclose = reconnect;
      // Never leave a CONNECTING WebSocket indefinitely registered in the
      // shared Terminal feed (including if its error/close events never fire).
      this.connectDeadline = setTimeout(() => {
        if (!this.stopped && this.socket === ws && !openedAt) reconnect();
      }, WS_CONNECT_TIMEOUT_MS);
    } catch {
      if (!this.stopped && !this.reconnectTimer) {
        const delay = marketTradeReconnectDelay(this.retries++);
        this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(); }, delay);
      }
    }
  }

  stop() {
    this.stopped = true;
    this.setTransportConnected(false);
    this.betaStop?.();
    this.betaStop = null;
    this.betaTransportConnected = false;
    this.betaVerifier?.close();
    this.betaVerifier = null;
    this.betaPreseed = [];
    this.abort.abort();
    if (this.ping) clearInterval(this.ping);
    if (this.connectDeadline) clearTimeout(this.connectDeadline);
    if (this.publishTimer) clearTimeout(this.publishTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.listeners.clear();
    this.socket?.close();
  }
}

/** Subscribe from each chart without opening a second WebSocket or repeating
 * the REST seed. An idle stream is retained for 1.5 seconds to absorb quick
 * coin swaps and fullscreen/unfullscreen remounts without losing trades.
 */
export function subscribeMarketTrades(scope: FeedScope, listener: Listener): () => void {
  const key = scopeKey(scope);
  marketStreamIdleRelease.cancel(key);
  let stream = marketStreams.get(key);
  if (!stream) {
    stream = new SharedMarketTradeStream({ ...scope, symbol: scope.symbol.toUpperCase() });
    marketStreams.set(key, stream);
  }
  const current = stream;
  const unsubscribe = current.subscribe(listener);
  if (current.listeners.size === 1 && !current.started) {
    current.started = true;
    void current.start();
  }
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    unsubscribe();
    if (current.listeners.size || marketStreams.get(key) !== current) return;
    marketStreamIdleRelease.defer(key, () => {
      // A new chart may have subscribed while this timer was pending. Never
      // close its active shared WebSocket or discard the retained trade IDs.
      if (marketStreams.get(key) !== current || current.listeners.size) return;
      marketStreams.delete(key);
      current.stop();
    });
  };
}

/** Lightweight diagnostics for checking stream reuse in tests/devtools.
 * No market data, trades, user identifiers or personal information are exposed.
 * Merely reading these counters performs no network or computation work.
 */
export function getSharedMarketTradeMetrics() {
  let listeners = 0;
  let incompleteScopes = 0;
  let recoveringScopes = 0;
  for (const stream of marketStreams.values()) {
    listeners += stream.listeners.size;
    if (stream.integrity === 'incomplete') incompleteScopes++;
    if (stream.integrity === 'recovering') recoveringScopes++;
  }
  return {
    scopes: marketStreams.size, // registered feeds, not necessarily connected WS sockets
    subscribers: listeners,
    idle: marketStreamIdleRelease.pending(),
    incompleteScopes,
    recoveringScopes,
  };
}

export function getSharedMarketPrints(scope: FeedScope): MarketPrint[] {
  const stream = marketStreams.get(scopeKey(scope));
  return stream?.integrity === 'verified' ? stream.tracker.snapshot() : [];
}
