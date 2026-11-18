import type { Server } from 'node:http';
import WebSocket, { WebSocketServer, type RawData } from 'ws';
import type { ExchangeId, MarketType } from '../src/types';
import { marketTickerFeed, type RawTicker, type MarketTickerFeed } from './marketTickerFeed';
import { normalizeExchangeSymbol, isValidExchangeSymbol } from '../src/utils/marketSymbols';

export type PublicQuoteScope = { exchange: ExchangeId; marketType: MarketType; symbol: string };

/** Decode UTF-8 from every ws RawData representation (Buffer, ArrayBuffer, Buffer[]). */
export function decodeScreenerQuoteRawData(raw: RawData): string {
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8');
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8');
  return raw.toString('utf8');
}
const scopeKey = (scope: PublicQuoteScope) =>
  [scope.exchange, scope.marketType, scope.symbol].join(':');

export function parseScreenerSubscription(raw: unknown, maxSymbols = 100): PublicQuoteScope[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const message = raw as Record<string, unknown>;
  if (message.type !== 'subscribe' || !Array.isArray(message.scopes) ||
      message.scopes.length > maxSymbols) return null;
  const accepted = new Map<string, PublicQuoteScope>();
  for (const item of message.scopes) {
    if (!item || typeof item !== 'object') return null;
    const scope = item as Record<string, unknown>;
    const { exchange, marketType } = scope;
    const symbol = typeof scope.symbol === 'string'
      ? normalizeExchangeSymbol(scope.symbol) : '';
    if ((exchange !== 'binance' && exchange !== 'bybit') ||
        (marketType !== 'spot' && marketType !== 'futures') ||
        !isValidExchangeSymbol(symbol) || symbol.length > 35) return null;
    const next: PublicQuoteScope = { exchange, marketType, symbol };
    accepted.set(scopeKey(next), next);
  }
  return [...accepted.values()];
}

/**
 * One Bybit public WebSocket per market for requested visible symbols only.
 * Public Spot accepts at most 10 args in each subscribe request; Futures
 * requests are also batched to avoid exceeding 21,000 characters.
 * No personal data, API keys or all-universe ticker subscriptions.
 */
export class BybitVisibleTickerSource {
  private states: Record<MarketType, {
    socket: WebSocket | null;
    active: Set<string>;
    wanted: Set<string>;
    retry: ReturnType<typeof setTimeout> | null;
    heartbeat: ReturnType<typeof setInterval> | null;
    failures: number;
    lastHeartbeatAt: number;
    idle: ReturnType<typeof setTimeout> | null;
  }> = {
    spot: { socket: null, active: new Set(), wanted: new Set(), retry: null,
      heartbeat: null, failures: 0, lastHeartbeatAt: 0, idle: null },
    futures: { socket: null, active: new Set(), wanted: new Set(), retry: null,
      heartbeat: null, failures: 0, lastHeartbeatAt: 0, idle: null },
  };

  constructor(
    private readonly feed: Pick<MarketTickerFeed, 'applyBybitTicker'> = marketTickerFeed,
    private readonly connectSocket: (url: string) => WebSocket =
      url => new WebSocket(url, { handshakeTimeout: 10_000, perMessageDeflate: false }),
    private readonly maxSymbols = 300,
  ) {}

  setWanted(market: MarketType, desired: Set<string>) {
    const state = this.states[market];
    state.wanted = new Set([...desired].slice(0, this.maxSymbols));
    if (state.idle) { clearTimeout(state.idle); state.idle = null; }
    if (!state.wanted.size) {
      // Prevent repeated reconnects during a fast page switch.
      if (!state.idle) state.idle = setTimeout(() => {
        state.idle = null;
        if (!state.wanted.size) this.close(market);
      }, 1_500);
      return;
    }
    if (state.socket?.readyState === WebSocket.OPEN) this.synchronize(market);
    else this.open(market);
  }

  private synchronize(market: MarketType) {
    const state = this.states[market], socket = state.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const removed = [...state.active].filter(symbol => !state.wanted.has(symbol));
    const added = [...state.wanted].filter(symbol => !state.active.has(symbol));
    const chunkSize = market === 'spot' ? 10 : 40;
    const sendChunks = (op: 'subscribe' | 'unsubscribe', symbols: string[]) => {
      for (let i = 0; i < symbols.length; i += chunkSize) {
        const args = symbols.slice(i, i + chunkSize).map(symbol => 'tickers.' + symbol);
        try { socket.send(JSON.stringify({ op, args })); }
        catch { try { socket.close(); } catch {} return false; }
      }
      return true;
    };
    if (!sendChunks('unsubscribe', removed)) return;
    if (!sendChunks('subscribe', added)) return;
    for (const symbol of removed) state.active.delete(symbol);
    for (const symbol of added) state.active.add(symbol);
  }

  private open(market: MarketType) {
    const state = this.states[market];
    if (state.socket || state.retry || !state.wanted.size) return;
    const path = market === 'futures' ? 'linear' : 'spot';
    let socket: WebSocket;
    try { socket = this.connectSocket('wss://stream.bybit.com/v5/public/' + path); }
    catch { this.schedule(market); return; }
    state.socket = socket;
    socket.on('open', () => {
      if (state.socket !== socket) return;
      state.failures = 0;
      state.lastHeartbeatAt = Date.now();
      this.synchronize(market);
      if (state.heartbeat) clearInterval(state.heartbeat);
      state.heartbeat = setInterval(() => {
        if (state.socket !== socket) return;
        if (socket.readyState !== WebSocket.OPEN ||
            Date.now() - state.lastHeartbeatAt > 60_000) {
          try { socket.close(); } catch {}
          return;
        }
        try { socket.send(JSON.stringify({ op: 'ping' })); }
        catch { try { socket.close(); } catch {} }
      }, 20_000);
    });
    socket.on('message', bytes => {
      if (state.socket !== socket) return;
      let msg: any;
      try { msg = JSON.parse(decodeScreenerQuoteRawData(bytes)); } catch { return; }
      if (msg?.op === 'pong' || msg?.ret_msg === 'pong' ||
          msg?.ret_msg === 'subscribe' || msg?.op === 'subscribe') {
        state.lastHeartbeatAt = Date.now();
      }
      if (typeof msg?.topic !== 'string' || !msg.topic.startsWith('tickers.') ||
          !msg.data || typeof msg.data !== 'object' || Array.isArray(msg.data)) return;
      const symbol = msg.topic.slice('tickers.'.length);
      if (!state.wanted.has(symbol) || msg.data.symbol !== symbol) return;
      const receivedAt = Number(msg.ts);
      if (!Number.isSafeInteger(receivedAt) || receivedAt > Date.now() + 2_000 ||
          Date.now() - receivedAt > 15_000) return;
      state.lastHeartbeatAt = Date.now();
      this.feed.applyBybitTicker(market, msg.data, receivedAt);
    });
    socket.on('error', () => { if (state.socket === socket) try { socket.close(); } catch {} });
    socket.on('close', () => {
      if (state.socket !== socket) return;
      state.socket = null;
      state.active.clear();
      if (state.heartbeat) clearInterval(state.heartbeat);
      state.heartbeat = null;
      if (state.wanted.size) this.schedule(market);
    });
  }

  private schedule(market: MarketType) {
    const state = this.states[market];
    if (state.retry || !state.wanted.size) return;
    const delay = Math.min(30_000, 1_000 * (2 ** Math.min(5, state.failures++)));
    state.retry = setTimeout(() => {
      state.retry = null;
      this.open(market);
    }, delay + Math.floor(Math.random() * 500));
  }

  private close(market: MarketType) {
    const state = this.states[market];
    if (state.retry) clearTimeout(state.retry);
    if (state.heartbeat) clearInterval(state.heartbeat);
    state.retry = state.heartbeat = null;
    state.active.clear();
    const ws = state.socket;
    state.socket = null;
    if (ws) {
      ws.removeAllListeners();
      ws.on('error', () => {});
      try { ws.close(); } catch {}
    }
  }

  stop() {
    for (const market of ['futures', 'spot'] as const) {
      const state = this.states[market];
      state.wanted.clear();
      if (state.idle) clearTimeout(state.idle);
      state.idle = null;
      this.close(market);
    }
  }

  stats() {
    return { spot: this.states.spot.wanted.size, futures: this.states.futures.wanted.size };
  }
}

/**
 * Public quote relay: browsers never open an extra Binance/Bybit connection.
 * Each client subscribes only to its visible screener rows and receives
 * coalesced updates every 400ms. Large/slow clients are disconnected.
 */
export function installScreenerLiveQuotes(
  server: Server,
  feed: Pick<MarketTickerFeed, 'subscribeLive'> = marketTickerFeed,
  bybit = new BybitVisibleTickerSource(),
) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 24_000 });
  const clients = new Map<WebSocket, { keys: Set<string>; pending: Map<string, RawTicker> }>();
  const byKey = new Map<string, Set<WebSocket>>();
  let sent = 0, rejected = 0, slow = 0;
  const maxClients = 256;
  server.on('upgrade', (request, socket, head) => {
    if ((request.url || '').split('?')[0] !== '/api/screener/live-quotes') return;
    // Public stream has no account access, but foreign websites must not be
    // allowed to turn the VPS into an unbounded quote subscription proxy.
    const origin = request.headers.origin;
    if (origin) {
      try {
        const originUrl = new URL(origin);
        if (!/^https?:$/.test(originUrl.protocol) || originUrl.host !== request.headers.host) {
          socket.destroy();
          return;
        }
      } catch { socket.destroy(); return; }
    }
    sockets.handleUpgrade(request, socket, head, ws => sockets.emit('connection', ws));
  });

  const updateBybitDemand = () => {
    for (const market of ['spot', 'futures'] as const) {
      const desired = new Set<string>();
      for (const [key, members] of byKey) {
        if (members.size && key.startsWith('bybit:' + market + ':')) {
          desired.add(key.slice(('bybit:' + market + ':').length));
        }
      }
      bybit.setWanted(market, desired);
    }
  };
  // Do not process every upstream miniTicker or wake the event loop every
  // 400ms when nobody is connected to this relay. The shared exchange feed
  // itself remains running for all other site features (alerts, screener etc.).
  let unsubscribe: (() => void) | null = null;
  let flush: ReturnType<typeof setInterval> | null = null;
  const stopRelayWork = () => {
    if (flush !== null) { clearInterval(flush); flush = null; }
    if (unsubscribe !== null) { unsubscribe(); unsubscribe = null; }
  };
  const startRelayWork = () => {
    if (unsubscribe !== null) return;
    unsubscribe = feed.subscribeLive(updates => {
      for (const row of updates) {
        const key = scopeKey(row);
        const members = byKey.get(key);
        if (!members) continue;
        for (const ws of members) clients.get(ws)?.pending.set(key, row);
      }
    });
    flush = setInterval(() => {
      for (const [ws, client] of clients) {
        if (!client.pending.size) continue;
        if (ws.readyState !== WebSocket.OPEN) { client.pending.clear(); continue; }
        if (ws.bufferedAmount > 512_000) {
          slow++; ws.close(1013, 'Screener consumer is slow'); continue;
        }
        const rows = [...client.pending.values()];
        client.pending.clear();
        try { ws.send(JSON.stringify({ type: 'quotes', at: Date.now(), rows })); sent++; }
        catch { ws.close(); }
      }
    }, 400);
  };
  const release = (ws: WebSocket) => {
    const client = clients.get(ws);
    if (!client) return;
    clients.delete(ws);
    let hasBybit = false;
    for (const key of client.keys) {
      const members = byKey.get(key);
      members?.delete(ws);
      if (!members?.size) byKey.delete(key);
      if (key.startsWith('bybit:')) hasBybit = true;
    }
    if (hasBybit) updateBybitDemand();
    if (!clients.size) stopRelayWork();
  };
  sockets.on('connection', ws => {
    if (clients.size >= maxClients) { rejected++; ws.close(1013, 'Screener at capacity'); return; }
    clients.set(ws, { keys: new Set(), pending: new Map() });
    startRelayWork();
    let lastSubscriptionAt = 0;
    let rapidSubscriptions = 0;
    ws.on('message', raw => {
      const now = Date.now();
      rapidSubscriptions = now - lastSubscriptionAt < 1_000 ? rapidSubscriptions + 1 : 0;
      lastSubscriptionAt = now;
      if (rapidSubscriptions > 5) {
        rejected++;
        ws.close(1008, 'Too many subscription updates');
        return;
      }
      const payloadBytes = Array.isArray(raw)
        ? raw.reduce((size, chunk) => size + chunk.byteLength, 0)
        : raw.byteLength;
      if (payloadBytes > 24_000) { ws.close(1009, 'Message too large'); return; }
      let message: unknown;
      try { message = JSON.parse(decodeScreenerQuoteRawData(raw)); } catch { ws.close(1008, 'Invalid subscription'); return; }
      const scopes = parseScreenerSubscription(message);
      if (!scopes) { rejected++; ws.close(1008, 'Invalid quote scopes'); return; }
      const next = new Set(scopes.map(scopeKey));
      const client = clients.get(ws);
      if (!client) return;
      let bybitChanged = false;
      for (const key of client.keys) {
        if (next.has(key)) continue;
        const members = byKey.get(key);
        members?.delete(ws);
        if (!members?.size) byKey.delete(key);
        client.pending.delete(key);
        if (key.startsWith('bybit:')) bybitChanged = true;
      }
      for (const key of next) {
        if (client.keys.has(key)) continue;
        let members = byKey.get(key);
        if (!members) { members = new Set(); byKey.set(key, members); }
        members.add(ws);
        if (key.startsWith('bybit:')) bybitChanged = true;
      }
      client.keys = next;
      if (bybitChanged) updateBybitDemand();
    });
    ws.on('close', () => release(ws));
    ws.on('error', () => release(ws));
  });
  return {
    stats: () => ({ clients: clients.size, subscriptions: byKey.size,
      bybit: bybit.stats(), sent, rejected, slow }),
    close: () => {
      stopRelayWork();
      for (const ws of clients.keys()) { try { ws.close(); } catch {} }
      clients.clear(); byKey.clear();
      bybit.stop();
      sockets.close();
    },
  };
}
