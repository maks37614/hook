import WebSocket from 'ws';
import type { ExchangeId, MarketType } from '../src/types';

export type PublicInstrument = { exchange: ExchangeId; market: MarketType; symbol: string };
type Scope = 'binance:spot' | 'binance:futures' | 'bybit:spot' | 'bybit:futures';
type PriceEntry = { price: number; updatedAt: number };
type Source = {
  scope: Scope;
  socket: WebSocket | null;
  desired: Set<string>;
  subscribed: Set<string>;
  reconnect: ReturnType<typeof setTimeout> | null;
  flush: ReturnType<typeof setTimeout> | null;
  ping: ReturnType<typeof setInterval> | null;
  failures: number;
  lastMessageAt: number;
  externalConnected: boolean;
};

const SCOPES: Scope[] = ['binance:spot', 'binance:futures', 'bybit:spot', 'bybit:futures'];
const MAX_BYBIT_TOPICS = 600;
const MAX_PRICE_AGE_MS = 15_000;

function streamUrl(scope: Scope): string {
  if (scope === 'binance:spot') return 'wss://stream.binance.com:9443/ws/!miniTicker@arr';
  if (scope === 'binance:futures') return 'wss://fstream.binance.com/market/ws/!miniTicker@arr';
  if (scope === 'bybit:spot') return 'wss://stream.bybit.com/v5/public/spot';
  return 'wss://stream.bybit.com/v5/public/linear';
}

function canonicalSymbol(value: string): string {
  return value.replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

function freshExchangeEventTime(raw: unknown, now: number): boolean {
  if (raw === undefined || raw === null) return true; // Older payloads may omit E/ts.
  const eventTime = Number(raw);
  return Number.isSafeInteger(eventTime) && eventTime > 0 &&
    eventTime <= now + 2_000 && now - eventTime <= MAX_PRICE_AGE_MS;
}

/**
 * Shared public price streams for server-side alerts. This never owns user
 * credentials. A missing/stale price is returned as null so callers retain
 * their existing REST fallback, rather than silently missing an alert.
 */
export class PublicPriceFeed {
  private sources = new Map<Scope, Source>();
  private prices = new Map<string, PriceEntry>();

  constructor(
    private readonly createSocket: (url: string) => WebSocket = url => new WebSocket(url, { handshakeTimeout: 10_000 }),
    private readonly now: () => number = Date.now,
    private readonly enabled = !process.env.NODE_OPTIONS?.includes('offline-network.mjs') &&
      process.env.H00K_ALERT_PRICE_WS !== '0',
    private readonly externalBinance = false,
  ) {
    for (const scope of SCOPES)
      this.sources.set(scope, { scope, socket: null, desired: new Set(), subscribed: new Set(),
        reconnect: null, flush: null, ping: null, failures: 0, lastMessageAt: 0,
        externalConnected: false });
  }

  private key(instrument: PublicInstrument): string {
    return `${instrument.exchange}:${instrument.market}:${canonicalSymbol(instrument.symbol)}`;
  }

  /** Reconcile subscriptions every alert cycle; multiple users count only once. */
  watch(instruments: PublicInstrument[]) {
    const desired = new Map<Scope, Set<string>>(SCOPES.map(scope => [scope, new Set()]));
    for (const item of instruments) {
      if (item.exchange !== 'binance' && item.exchange !== 'bybit') continue;
      if (item.market !== 'spot' && item.market !== 'futures') continue;
      const symbol = canonicalSymbol(item.symbol);
      if (!symbol) continue;
      const scope: Scope = `${item.exchange}:${item.market}`;
      desired.get(scope)!.add(symbol);
    }

    const keep = new Set(instruments.map(i => this.key(i)));
    for (const key of this.prices.keys()) if (!keep.has(key)) this.prices.delete(key);

    for (const scope of SCOPES) {
      const source = this.sources.get(scope)!;
      source.desired = desired.get(scope)!;
      if (!source.desired.size) {
        if (!this.externalBinance || !scope.startsWith('binance:')) this.release(source);
      } else if (this.enabled && !(this.externalBinance && scope.startsWith('binance:'))) {
        this.connect(source);
        this.flushBybit(source);
      }
    }
  }

  current(instrument: PublicInstrument): number | null {
    if (!this.enabled) return null;
    const key = this.key(instrument);
    const entry = this.prices.get(key);
    const scope: Scope = `${instrument.exchange}:${instrument.market}`;
    const source = this.sources.get(scope);
    const connected = this.externalBinance && scope.startsWith('binance:')
      ? source?.externalConnected : source?.socket?.readyState === WebSocket.OPEN;
    if (!entry || !source || !connected ||
        this.now() - entry.updatedAt > MAX_PRICE_AGE_MS || entry.updatedAt > this.now()) return null;
    return entry.price;
  }

  status() {
    return SCOPES.map(scope => {
      const source = this.sources.get(scope)!;
      return { scope, subscribed: source.subscribed.size, requested: source.desired.size,
        connected: this.externalBinance && scope.startsWith('binance:')
          ? source.externalConnected : source.socket?.readyState === WebSocket.OPEN,
        lastMessageAgeMs: source.lastMessageAt ? this.now() - source.lastMessageAt : null };
    });
  }

  /** Public market payload only. All prices are checked before sharing with alerts. */
  private message(source: Source, content: WebSocket.RawData) {
    let packet: any;
    try { packet = JSON.parse(content.toString()); }
    catch { return; }
    source.lastMessageAt = this.now();
    const scope = source.scope;
    if (packet?.op === 'subscribe' && packet.success === false) {
      // A rejected subscription must not be considered active forever.
      source.subscribed.clear();
      try { source.socket?.close(); } catch { /* close event will retry */ }
      return;
    }
    if (scope.startsWith('binance:')) {
      const updates = packet?.data ?? packet;
      const ticks = Array.isArray(updates) ? updates : [updates];
      for (const tick of ticks) {
        const symbol = canonicalSymbol(String(tick?.s ?? ''));
        if (!source.desired.has(symbol) ||
            (scope === 'binance:futures' && Number(tick?.st ?? 1) !== 1) ||
            !freshExchangeEventTime(tick?.E, this.now())) continue;
        this.update(scope, symbol, tick?.c);
      }
    } else if (typeof packet?.topic === 'string' && packet.topic.startsWith('tickers.')) {
      if (!freshExchangeEventTime(packet.ts, this.now())) return;
      source.failures = 0;
      const symbol = canonicalSymbol(packet.topic.slice('tickers.'.length));
      if (!source.desired.has(symbol)) return;
      const ticks = Array.isArray(packet.data) ? packet.data : [packet.data];
      for (const tick of ticks) {
        if (tick?.lastPrice != null) this.update(scope, symbol, tick.lastPrice);
        else {
          // Bybit delta may omit an unchanged field. Existing price is still valid.
          const existing = this.prices.get(`${scope}:${symbol}`);
          if (existing) existing.updatedAt = this.now();
        }
      }
    }
  }

  /**
   * The production singleton consumes the already-running shared Binance
   * market ticker socket. Do not open two high-volume all-market sockets per
   * market (one for Screener and another for Alerts).
   */
  setBinanceConnection(market: MarketType, connected: boolean) {
    if (!this.externalBinance) return;
    const scope: Scope = `binance:${market}`;
    const source = this.sources.get(scope)!;
    source.externalConnected = connected;
    if (!connected) {
      // A new WS connection must establish a fresh price after reconnect.
      // Never trigger a user alert from the previous socket's cached quote.
      for (const key of this.prices.keys())
        if (key.startsWith(`${scope}:`)) this.prices.delete(key);
    }
  }

  ingestBinanceTicks(market: MarketType, ticks: unknown[]) {
    if (!this.externalBinance || !Array.isArray(ticks)) return;
    const scope: Scope = `binance:${market}`;
    const source = this.sources.get(scope)!;
    if (!source.externalConnected) return;
    source.lastMessageAt = this.now();
    for (const raw of ticks) {
      if (!raw || typeof raw !== 'object') continue;
      const tick = raw as Record<string, unknown>;
      const symbol = typeof tick.s === 'string' ? canonicalSymbol(tick.s) : '';
      if (!source.desired.has(symbol) ||
          (market === 'futures' && Number(tick.st ?? 1) !== 1) ||
          !freshExchangeEventTime(tick.E, this.now())) continue;
      this.update(scope, symbol, tick.c);
    }
  }

  private update(scope: Scope, symbol: string, rawPrice: unknown) {
    const price = Number(rawPrice);
    if (!Number.isFinite(price) || price <= 0) return;
    this.prices.set(`${scope}:${symbol}`, { price, updatedAt: this.now() });
  }

  private connect(source: Source) {
    if (!source.desired.size || source.reconnect ||
        (source.socket && source.socket.readyState !== WebSocket.CLOSED)) return;
    let socket: WebSocket;
    try { socket = this.createSocket(streamUrl(source.scope)); }
    catch { this.scheduleReconnect(source); return; }
    source.socket = socket;
    source.subscribed.clear();
    socket.on('open', () => {
      if (source.socket !== socket) return;
      // Do not reset reconnect backoff until a real market frame arrives.
      source.lastMessageAt = this.now();
      if (source.scope.startsWith('bybit:')) {
        source.ping = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ op: 'ping' }));
        }, 20_000);
        source.ping.unref?.();
        this.flushBybit(source);
      }
    });
    socket.on('message', data => {
      if (source.socket === socket) this.message(source, data);
    });
    socket.on('error', () => {
      // ws.close() while CONNECTING throws synchronously. Let the library's
      // subsequent close event schedule a bounded reconnect.
      if (source.socket === socket && socket.readyState === WebSocket.OPEN) {
        try { socket.close(); } catch { /* close event handles cleanup */ }
      }
    });
    socket.on('close', () => {
      if (source.socket !== socket) return;
      this.clearTimers(source);
      source.socket = null;
      source.subscribed.clear();
      // Freshness belongs to the *connection*, not only the 15s clock.
      // Reconnecting must wait for a new ticker snapshot before firing alerts.
      for (const key of this.prices.keys())
        if (key.startsWith(`${source.scope}:`)) this.prices.delete(key);
      if (source.desired.size) this.scheduleReconnect(source);
    });
  }

  private flushBybit(source: Source) {
    if (!source.scope.startsWith('bybit:') || source.flush ||
        source.socket?.readyState !== WebSocket.OPEN) return;

    const unsub = [...source.subscribed].filter(symbol => !source.desired.has(symbol)).slice(0, 10);
    const sub = [...source.desired].filter(symbol => !source.subscribed.has(symbol))
      .slice(0, Math.min(10, Math.max(0, MAX_BYBIT_TOPICS - source.subscribed.size)));

    const args = unsub.length ? unsub : sub;
    if (!args.length) return;
    const op = unsub.length ? 'unsubscribe' : 'subscribe';
    try {
      source.socket.send(JSON.stringify({ op, args: args.map(symbol => `tickers.${symbol}`) }));
      for (const symbol of args) {
        if (op === 'subscribe') source.subscribed.add(symbol);
        else source.subscribed.delete(symbol);
      }
    } catch { source.socket.close(); return; }
    source.flush = setTimeout(() => {
      source.flush = null;
      this.flushBybit(source);
    }, 350);
    source.flush.unref?.();
  }

  private scheduleReconnect(source: Source) {
    if (!source.desired.size || source.reconnect) return;
    const backoff = Math.min(30_000, 1_000 * (2 ** Math.min(source.failures++, 5)));
    source.reconnect = setTimeout(() => {
      source.reconnect = null;
      this.connect(source);
    }, backoff + Math.floor(Math.random() * 350));
    source.reconnect.unref?.();
  }

  private clearTimers(source: Source) {
    if (source.flush) clearTimeout(source.flush);
    if (source.ping) clearInterval(source.ping);
    source.flush = null;
    source.ping = null;
  }

  private release(source: Source) {
    this.clearTimers(source);
    if (source.reconnect) clearTimeout(source.reconnect);
    source.reconnect = null;
    source.subscribed.clear();
    if (source.socket) {
      const socket = source.socket;
      source.socket = null;
      try {
        if (socket.readyState === WebSocket.CONNECTING) socket.terminate();
        else socket.close();
      } catch { /* already closed */ }
    }
  }

  close() {
    for (const source of this.sources.values()) {
      source.desired.clear();
      this.release(source);
    }
    this.prices.clear();
  }
}

export const publicPriceFeed = new PublicPriceFeed(undefined, undefined, undefined, true);
