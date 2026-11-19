import type { Server } from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import type { ExchangeId, MarketType } from '../src/types';
import type { BookUpdate } from '../src/utils/binanceOrderBook';
import { chartDepthScope, type ChartDepthPacket } from '../src/utils/hookChartDepthProtocol';
import { isFreshDepthTime, ORDER_BOOK_MAX_AGE_MS, parseDepthLevels } from '../src/utils/orderBookValidation';
import { normalizeExchangeSymbol } from '../src/utils/marketSymbols';
import { applyDepthSide } from '../src/components/hookchart/depthBestPrice';
import { acquireExchangeStream } from './surveillance/sharedExchangeStream';

export interface ChartDepthSource {
  status: string;
  on(event: string, listener: (...args: any[]) => void): unknown;
  removeAllListeners(): unknown;
  resyncOrderBook(): void;
  destroy(): void;
}
type SourceFactory = (symbol: string, exchange: ExchangeId, market: MarketType) => ChartDepthSource;
type Entry = {
  scope: string; source: ChartDepthSource; clients: Set<WebSocket>;
  status: ChartDepthPacket['status'];
  bids: Map<number, number>; asks: Map<number, number>;
  bestBid: number; bestAsk: number;
  sequence: number; eventTime: number; receivedAt: number;
};

/** Public exchange depth only; personal surveillance data never enters this stream. */
export function installHookChartDepthStream(server: Server, createSource: SourceFactory =
  (symbol, exchange, market) => acquireExchangeStream(symbol, exchange, market, true)) {
  const entries = new Map<string, Entry>();
  // Default limits are unchanged; override only after measuring VPS capacity.
  const boundedLimit = (key: string, fallback: number, ceiling: number) => {
    const value = Number(process.env[key]);
    return Number.isSafeInteger(value) && value > 0 ? Math.min(value, ceiling) : fallback;
  };
  const maxDepthClients = boundedLimit('H00K_MAX_DEPTH_CLIENTS', 256, 10_000);
  const maxDepthMarkets = boundedLimit('H00K_MAX_DEPTH_MARKETS', 64, 512);
  // Route upgrades explicitly: other site WebSocket endpoints share this server.
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  // Aggregates only: count actual VPS-to-client payloads, never retain books,
  // symbols or user identifiers in diagnostics.
  const counters = { sentPackets: 0, sentBytes: 0, slowConsumers: 0 };
  server.on('upgrade', (request, socket, head) => {
    if ((request.url || '').split('?')[0] !== '/api/hookchart/depth') return;
    sockets.handleUpgrade(request, socket, head, client => sockets.emit('connection', client, request));
  });
  const sendEncoded = (client: WebSocket, encoded: string, bytes = Buffer.byteLength(encoded)) => {
    if (client.readyState !== WebSocket.OPEN) return;
    if (client.bufferedAmount > 1_000_000) {
      counters.slowConsumers++;
      client.close(1013, 'Depth consumer is too slow');
      return;
    }
    try {
      client.send(encoded);
      counters.sentPackets++;
      counters.sentBytes += bytes;
    } catch { try { client.close(); } catch {} }
  };
  const send = (client: WebSocket, packet: ChartDepthPacket) => {
    if (client.readyState !== WebSocket.OPEN) return;
    sendEncoded(client, JSON.stringify(packet));
  };
  const publish = (entry: Entry, status: ChartDepthPacket['status'], update?: BookUpdate) => {
    entry.status = status;
    if (!entry.clients.size) return;
    // Serialize this exact exchange packet once; each chart still receives every frame.
    const encoded = JSON.stringify({ scope: entry.scope, sampledAt: Date.now(), status, ...(update ? { update } : {}) });
    const bytes = Buffer.byteLength(encoded); // once per exchange frame, not once per viewer
    for (const client of entry.clients) sendEncoded(client, encoded, bytes);
  };
  const clear = (entry: Entry) => {
    entry.bids.clear(); entry.asks.clear();
    entry.bestBid = -Infinity; entry.bestAsk = Infinity;
    entry.sequence = entry.eventTime = entry.receivedAt = 0;
  };
  const release = (entry: Entry, client: WebSocket) => {
    entry.clients.delete(client);
    if (!entry.clients.size && entries.get(entry.scope) === entry) {
      entries.delete(entry.scope);
      entry.source.removeAllListeners();
      entry.source.destroy();
    }
  };

  sockets.on('connection', (client, request) => {
    const query = new URL(request.url || '', 'http://localhost').searchParams;
    const exchange = query.get('exchange'), market = query.get('market');
    const symbol = normalizeExchangeSymbol(query.get('symbol') || '');
    if (!['binance', 'bybit'].includes(exchange || '') || !['spot', 'futures'].includes(market || '') ||
        !/^[\p{L}\p{M}\p{N}]{1,64}$/u.test(symbol)) {
      client.close(1008, 'Invalid exchange, market or symbol'); return;
    }
    const scope = chartDepthScope(exchange as ExchangeId, market as MarketType, symbol);
    if (sockets.clients.size > maxDepthClients || (!entries.has(scope) && entries.size >= maxDepthMarkets)) {
      client.close(1013, 'Depth capacity reached'); return;
    }
    // Send the server clock immediately, before any exchange connection or snapshot request.
    send(client, { scope, sampledAt: Date.now(), status: 'CONNECTING' });
    let entry = entries.get(scope);
    if (!entry) {
      try {
        const source = createSource(symbol, exchange as ExchangeId, market as MarketType);
        entry = { scope, source, status: source.status === 'ERROR' ? 'ERROR' : 'SYNCING', clients: new Set(), bids: new Map(), asks: new Map(), bestBid: -Infinity, bestAsk: Infinity, sequence: 0, eventTime: 0, receivedAt: 0 };
        entries.set(scope, entry);
        const current = entry;
        source.on('status', (status: string) => {
          if (status === 'LIVE') return; // A book becomes live only after its depth update is validated.
          clear(current);
          const allowed = ['CONNECTING', 'SYNCING', 'STALE', 'RESYNCING', 'ERROR'];
          publish(current, allowed.includes(status) ? status as ChartDepthPacket['status'] : 'ERROR');
        });
        source.on('error', () => { clear(current); publish(current, 'ERROR'); });
        source.on('depth', (update: BookUpdate) => {
          const bids = parseDepthLevels(update.bids), asks = parseDepthLevels(update.asks);
          const now = Date.now(), eventTime = update.eventTime ?? now;
          if (!bids || !asks || !Number.isSafeInteger(update.sequence) || update.sequence <= 0 || !isFreshDepthTime(eventTime, now)) {
            clear(current); publish(current, 'RESYNCING'); source.resyncOrderBook(); return;
          }
          if (update.isSnapshot) clear(current);
          else if (!current.sequence) { source.resyncOrderBook(); return; }
          else if (update.sequence <= current.sequence) return;
          // Preserve every level and every delta; only removing the best price
          // can require a full scan for its successor on that side.
          current.bestBid = applyDepthSide(current.bids, bids, current.bestBid, true);
          current.bestAsk = applyDepthSide(current.asks, asks, current.bestAsk, false);
          if (!current.bids.size || !current.asks.size || current.bestBid >= current.bestAsk) {
            clear(current); publish(current, 'RESYNCING'); source.resyncOrderBook(); return;
          }
          current.sequence = update.sequence; current.eventTime = eventTime; current.receivedAt = now;
          publish(current, 'LIVE', { ...update, bids, asks, eventTime });
        });
      } catch { send(client, { scope, sampledAt: Date.now(), status: 'ERROR' }); client.close(1011, 'Depth source unavailable'); return; }
    }
    entry.clients.add(client);
    const current = entry;
    if (current.sequence && Date.now() - current.receivedAt <= ORDER_BOOK_MAX_AGE_MS && isFreshDepthTime(current.eventTime)) {
      send(client, { scope, sampledAt: Date.now(), status: 'LIVE', update: {
        isSnapshot: true, sequence: current.sequence, eventTime: current.eventTime,
        bids: [...current.bids], asks: [...current.asks],
      } });
    } else if (current.sequence) { clear(current); current.source.resyncOrderBook(); }
    else send(client, { scope, sampledAt: Date.now(), status: current.status });
    client.on('close', () => release(current, client));
    client.on('error', () => { release(current, client); client.terminate(); });
    client.on('message', () => client.close(1008, 'Depth stream is read-only'));
  });
  const watchdog = setInterval(() => {
    for (const entry of entries.values()) {
      if (entry.sequence && (Date.now() - entry.receivedAt > ORDER_BOOK_MAX_AGE_MS || !isFreshDepthTime(entry.eventTime))) {
        clear(entry); publish(entry, 'STALE'); entry.source.resyncOrderBook();
      }
    }
  }, 1000);
  watchdog.unref();
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(watchdog);
    for (const entry of entries.values()) { entry.source.removeAllListeners(); entry.source.destroy(); }
    entries.clear();
    for (const client of sockets.clients) client.terminate();
    sockets.close();
  };
  server.once('close', close);
  return {
    close, activeMarkets: () => entries.size, activeClients: () => sockets.clients.size,
    stats: () => ({
      activeMarkets: entries.size,
      clients: sockets.clients.size,
      ...counters,
    }),
  };
}
