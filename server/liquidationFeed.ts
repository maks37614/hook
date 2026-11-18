import fs from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import WebSocket, { WebSocketServer, type RawData } from 'ws';
import { sharedLiquidationUpstreams } from './liquidationUpstreamPool';
import { liquidationArchive } from './liquidationArchive';

export type LiquidationRow = {
  id: string; side: 'LONG' | 'SHORT'; t: number; p: number; q: number; usd: number;
};
type Exchange = 'binance' | 'bybit';
type Entry = {
  key: string; exchange: Exchange; symbol: string;
  rows: LiquidationRow[]; idIndex: Map<string, number>; lastPrunedAt: number;
  clients: Set<WebSocket>; bulkClients: Set<WebSocket>;
  upstream: WebSocket | null; ping: ReturnType<typeof setInterval> | null;
  reconnect: ReturnType<typeof setTimeout> | null;
  failures: number; idleAt: number; lastEventAt: number;
  pooledStop: (() => void) | null; pooledConnected: boolean;
};
const RETAIN_MS = 30 * 60_000;
const MAX_ROWS = 1500;
// Stop an unused upstream after two minutes, but retain the rolling 30m history.
const IDLE_GRACE_MS = 2 * 60_000;
const MULTIPLEX_ENABLED = process.env.LIQ_MULTIPLEX_ENABLED !== '0';
const envInt = (name: string, fallback: number, min: number, max: number) => {
  const n = Number(process.env[name]);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : fallback;
};
const MAX_MARKETS = MULTIPLEX_ENABLED ? envInt('LIQ_MARKET_CAP', 256, 64, 768) : 64;
const MAX_CLIENTS = envInt('LIQ_CLIENT_CAP', 2000, 100, 5000);
const STORE_FILE = path.join(process.cwd(), 'server', 'data', 'liquidations.json');
const validSymbol = (symbol: string) => symbol.length <= 80 && /^[\p{L}\p{M}\p{N}]{3,80}$/u.test(symbol);

export function liquidationUpstreamUrl(exchange: Exchange, symbol: string): string {
  return exchange === 'binance'
    ? `wss://fstream.binance.com/market/ws/${encodeURIComponent(symbol.toLowerCase())}@forceOrder`
    : 'wss://stream.bybit.com/v5/public/linear';
}

/** Normalize exchange messages once on the server, never fabricate unavailable trades. */
export function parseLiquidations(exchange: Exchange, symbol: string, payload: unknown): LiquidationRow[] {
  if (!payload || typeof payload !== 'object') return [];
  const msg = payload as Record<string, any>;
  const rows: LiquidationRow[] = [];
  if (exchange === 'binance') {
    const order = msg.o;
    if (!order || String(order.s).toUpperCase() !== symbol ||
        (msg.e != null && msg.e !== 'forceOrder') ||
        (msg.st != null && Number(msg.st) !== 1)) return [];
    const action = String(order.S).toUpperCase();
    if (action !== 'BUY' && action !== 'SELL') return [];
    // Binance sends numeric prices as strings, including "0" (truthy in JS).
    // Use the first *positive, finite* execution price rather than accepting
    // an unavailable average price of "0" and dropping a real filled order.
    const averagePrice = Number(order.ap);
    const lastFillPrice = Number(order.L);
    const orderPrice = Number(order.p);
    const p = Number.isFinite(averagePrice) && averagePrice > 0 ? averagePrice
      : Number.isFinite(lastFillPrice) && lastFillPrice > 0 ? lastFillPrice
      : Number.isFinite(orderPrice) && orderPrice > 0 ? orderPrice : 0;
    const z = Number(order.z || 0), last = Number(order.l || 0);
    // z is cumulative executed quantity; l is the last executed quantity.
    // q is the ORIGINAL order size, not proof of execution. Using q as a
    // fallback would report unfilled liquidations and inflate Liq/cascades.
    const q = z > 0 ? z : last > 0 ? last : 0;
    const t = Number(order.T || msg.E);
    rows.push({
      id: `bin:${symbol}:${String(order.i ?? order.T ?? msg.E ?? t)}`,
      side: action === 'SELL' ? 'LONG' : 'SHORT',
      t, p, q, usd: p * q,
    });
  } else if (msg.topic === `allLiquidation.${symbol}` && Array.isArray(msg.data)) {
    const occurrences = new Map<string, number>();
    for (let index = 0; index < msg.data.length; index++) {
      const row = msg.data[index];
      const p = Number(row?.p), q = Number(row?.v), t = Number(row?.T ?? msg.ts);
      const side = String(row?.S).toLowerCase();
      if ((side !== 'buy' && side !== 'sell') || (row?.s && String(row.s).toUpperCase() !== symbol)) continue;
      const eventKey = `${t}:${side}:${p}:${q}`;
      const occurrence = occurrences.get(eventKey) ?? 0;
      occurrences.set(eventKey, occurrence + 1);
      const packetTime = Number.isSafeInteger(msg.ts) && msg.ts > 0 ? msg.ts : t;
      rows.push({
        id: `byb:${symbol}:${t}:${row?.S}:${p}:${q}:${packetTime}:${occurrence}`,
        side: side === 'buy' ? 'LONG' : 'SHORT',
        t, p, q, usd: p * q,
      });
    }
  }
  const now = Date.now();
  return rows.filter(row => Number.isFinite(row.p) && row.p > 0 &&
    Number.isFinite(row.q) && row.q > 0 && Number.isSafeInteger(row.t) &&
    row.t <= now + 2000 && row.t >= now - RETAIN_MS &&
    Number.isFinite(row.usd) && row.usd > 0);
}

/**
 * Rebuild the persisted 30-minute snapshot after a server restart. A snapshot
 * may contain older out-of-order arrivals and repeated cumulative fills:
 * selecting its last 1500 array entries before sorting would silently drop
 * recent liquidation evidence and keep duplicates after restart.
 *
 * This runs only at startup, never on incoming WebSocket messages.
 */
export function restorePersistedLiquidations(rows: unknown, now = Date.now()): LiquidationRow[] {
  if (!Array.isArray(rows)) return [];
  const byId = new Map<string, LiquidationRow>();
  for (const value of rows) {
    if (!value || typeof value !== 'object') continue;
    const row = value as LiquidationRow;
    if (typeof row.id !== 'string' || !row.id || row.id.length > 180 ||
        (row.side !== 'LONG' && row.side !== 'SHORT') ||
        !Number.isSafeInteger(row.t) || row.t > now || row.t < now - RETAIN_MS ||
        !Number.isFinite(row.p) || row.p <= 0 ||
        !Number.isFinite(row.q) || row.q <= 0 ||
        !Number.isFinite(row.usd) || row.usd <= 0) continue;
    const previous = byId.get(row.id);
    // A higher executed quantity supersedes a prior cumulative order update.
    if (!previous || row.q > previous.q ||
        (row.q === previous.q && row.usd > previous.usd)) byId.set(row.id, row);
  }
  return [...byId.values()].sort((a, b) => a.t - b.t).slice(-MAX_ROWS);
}

export class SharedLiquidationFeed {
  private entries = new Map<string, Entry>();
  private counters = { upstreamConnections: 0, reconnects: 0, received: 0, duplicates: 0,
    rejectedClients: 0, savedSnapshots: 0, failedSaves: 0 };
  private writing: Promise<void> | null = null;
  private revision = 0;
  private savedRevision = 0;

  constructor() {
    try {
      const saved = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')) as Record<string, LiquidationRow[]>;
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        for (const [key, rows] of Object.entries(saved).slice(0, MAX_MARKETS)) {
          const [exchange, symbol] = key.split(':');
          if (!['binance', 'bybit'].includes(exchange) || !validSymbol(symbol || '') ||
              !Array.isArray(rows)) continue;
          const valid = restorePersistedLiquidations(rows);
          if (valid.length) this.entries.set(key, this.makeEntry(exchange as Exchange, symbol, valid));
        }
      }
    } catch { /* no saved history yet */ }
  }

  private makeEntry(exchange: Exchange, symbol: string, rows: LiquidationRow[] = []): Entry {
    return { key: `${exchange}:${symbol}`, exchange, symbol, rows,
      idIndex: new Map(rows.map((row, index) => [row.id, index])), lastPrunedAt: 0,
      clients: new Set(), bulkClients: new Set(),
      upstream: null, ping: null, reconnect: null, failures: 0,
      idleAt: Date.now(), lastEventAt: rows.length ? Math.max(...rows.map(r => r.t)) : 0,
      pooledStop: null, pooledConnected: false };
  }

  stats() {
    const all = [...this.entries.values()];
    const upstreamPool = MULTIPLEX_ENABLED ? sharedLiquidationUpstreams.stats() : null;
    return { ...this.counters, activeMarkets: all.length,
      mode: MULTIPLEX_ENABLED ? 'multiplex' : 'legacy',
      maxMarkets: MAX_MARKETS, maxClients: MAX_CLIENTS, upstreamPool,
      connectedMarkets: all.filter(e =>
        e.pooledConnected || e.upstream?.readyState === WebSocket.OPEN).length,
      viewers: all.reduce((count, e) => count + e.clients.size + e.bulkClients.size, 0),
      storedEvents: all.reduce((count, e) => count + e.rows.length, 0),
      byInstrument: all.map(e => ({ source: e.key, viewers: e.clients.size + e.bulkClients.size,
        connected: e.pooledConnected || e.upstream?.readyState === WebSocket.OPEN,
        events: e.rows.length,
        lastEventAt: e.lastEventAt || null })) };
  }

  private hasViewers(entry: Entry) { return entry.clients.size > 0 || entry.bulkClients.size > 0; }

  private send(client: WebSocket, packet: unknown) {
    if (client.readyState !== WebSocket.OPEN) return;
    if (client.bufferedAmount > 1_000_000) { client.close(1013, 'Slow consumer'); return; }
    client.send(JSON.stringify(packet));
  }

  private broadcast(entry: Entry, packet: unknown) {
    const encoded = JSON.stringify(packet);
    for (const client of entry.clients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      if (client.bufferedAmount > 1_000_000) client.close(1013, 'Slow consumer');
      else client.send(encoded);
    }
    // Multiplex clients receive the SAME event with an explicit scope. No
    // changes to the legacy chart/notification protocol.
    if (entry.bulkClients.size) {
      const scoped = JSON.stringify({ ...(packet as object),
        exchange: entry.exchange, symbol: entry.symbol });
      for (const client of entry.bulkClients) {
        if (client.readyState !== WebSocket.OPEN) continue;
        if (client.bufferedAmount > 1_000_000) client.close(1013, 'Slow consumer');
        else client.send(scoped);
      }
    }
  }

  private prune(entry: Entry, force = false) {
    const now = Date.now();
    // No full-array scan on every liquidation packet during a market cascade.
    if (!force && entry.rows.length <= MAX_ROWS && now - entry.lastPrunedAt < 2000) return;
    const cutoff = now - RETAIN_MS;
    const count = entry.rows.length;
    const live = entry.rows.filter(row => row.t >= cutoff);
    // Packets may arrive out of timestamp order during reconnects. A delayed
    // old liquidation must not evict newer evidence during an active cascade.
    // Sorting only on overflow avoids extra CPU on normal 2s pruning.
    if (live.length > MAX_ROWS) live.sort((a, b) => a.t - b.t);
    entry.rows = live.slice(-MAX_ROWS);
    entry.idIndex = new Map(entry.rows.map((row, index) => [row.id, index]));
    entry.lastPrunedAt = now;
    if (entry.rows.length !== count) this.revision++;
  }

  private onRows(entry: Entry, rows: LiquidationRow[]) {
    for (const row of rows) {
      const previous = entry.idIndex.get(row.id);
      if (previous !== undefined) {
        const old = entry.rows[previous];
        // A partially-filled liquidation order can be reported again with a
        // larger cumulative fill; replace it rather than double-counting.
        if (row.q <= old.q) { this.counters.duplicates++; continue; }
        entry.rows[previous] = row;
      } else {
        entry.idIndex.set(row.id, entry.rows.length);
        entry.rows.push(row);
      }
      entry.lastEventAt = Math.max(entry.lastEventAt, row.t);
      this.counters.received++;
      this.revision++;
      // Optional durable observed-event history. Unique (exchange,symbol,id)
      // upserts are independent of the bounded 30-minute chart event buffer.
      liquidationArchive.record({ exchange: entry.exchange, symbol: entry.symbol, ...row });
      this.broadcast(entry, { type: 'liquidation', event: row });
    }
    this.prune(entry);
  }

  private stopUpstream(entry: Entry) {
    if (entry.pooledStop) {
      const release = entry.pooledStop;
      entry.pooledStop = null;
      entry.pooledConnected = false;
      release();
    }
    if (entry.reconnect) clearTimeout(entry.reconnect);
    entry.reconnect = null;
    if (entry.ping) clearInterval(entry.ping);
    entry.ping = null;
    const socket = entry.upstream;
    entry.upstream = null;
    if (socket) { try { socket.terminate(); } catch {} }
  }

  private connect(entry: Entry) {
    if (MULTIPLEX_ENABLED) {
      if (entry.pooledStop) return;
      entry.pooledStop = sharedLiquidationUpstreams.subscribe(entry.exchange, entry.symbol, {
        onPacket: packet => this.onRows(entry, parseLiquidations(entry.exchange, entry.symbol, packet)),
        onStatus: connected => {
          entry.pooledConnected = connected;
          this.broadcast(entry, { type: 'status', connected });
        },
      });
      return;
    }
    if (entry.upstream || entry.reconnect) return;
    const url = liquidationUpstreamUrl(entry.exchange, entry.symbol);
    let socket: WebSocket;
    try { socket = new WebSocket(url, { handshakeTimeout: 10_000, perMessageDeflate: false }); }
    catch { this.retry(entry); return; }
    entry.upstream = socket;
    this.counters.upstreamConnections++;
    socket.on('open', () => {
      if (entry.upstream !== socket) return;
      entry.failures = 0;
      if (entry.exchange === 'bybit') {
        socket.send(JSON.stringify({ op: 'subscribe', args: [`allLiquidation.${entry.symbol}`] }));
        entry.ping = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ op: 'ping' }));
        }, 20_000);
        entry.ping.unref?.();
      }
      this.broadcast(entry, { type: 'status', connected: true });
    });
    socket.on('message', data => {
      if (entry.upstream !== socket) return;
      try {
        const packet = JSON.parse(data.toString());
        if (entry.exchange === 'bybit' && packet?.op === 'subscribe' && packet?.success === false) {
          console.warn(`[LiquidationFeed] Bybit rejected subscription for ${entry.symbol}`);
          socket.terminate();
          return;
        }
        this.onRows(entry, parseLiquidations(entry.exchange, entry.symbol, packet));
      } catch { /* invalid market payload */ }
    });
    socket.on('error', () => { if (entry.upstream === socket) try { socket.close(); } catch {} });
    socket.on('close', () => {
      if (entry.upstream !== socket) return;
      entry.upstream = null;
      if (entry.ping) clearInterval(entry.ping);
      entry.ping = null;
      this.broadcast(entry, { type: 'status', connected: false });
      if (this.hasViewers(entry) || Date.now() - entry.idleAt < IDLE_GRACE_MS) this.retry(entry);
    });
  }

  private retry(entry: Entry) {
    if (entry.reconnect) return;
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(entry.failures++, 5));
    this.counters.reconnects++;
    entry.reconnect = setTimeout(() => {
      entry.reconnect = null;
      if (this.entries.get(entry.key) === entry &&
          (this.hasViewers(entry) || Date.now() - entry.idleAt < IDLE_GRACE_MS)) this.connect(entry);
    }, delay + Math.floor(Math.random() * 300));
    entry.reconnect.unref?.();
  }

  addClient(client: WebSocket, exchange: Exchange, symbol: string, liveOnly = false) {
    const key = `${exchange}:${symbol}`;
    let entry = this.entries.get(key);
    if (!entry && this.entries.size >= MAX_MARKETS) {
      const idle = [...this.entries.values()].filter(e => !this.hasViewers(e))
        .sort((a, b) => a.idleAt - b.idleAt)[0];
      if (idle) {
        this.stopUpstream(idle);
        this.entries.delete(idle.key);
        this.revision++;
      }
    }
    if (!entry && this.entries.size >= MAX_MARKETS) {
      this.counters.rejectedClients++;
      client.close(1013, 'Liquidation market capacity reached');
      return;
    }
    if (!entry) {
      entry = this.makeEntry(exchange, symbol);
      this.entries.set(key, entry);
    }
    entry.clients.add(client);
    this.prune(entry);
    // Profile notifications need only new events. Avoid sending up to 1,500
    // historical rows to every notification-only client on reconnect.
    if (liveOnly) {
      this.send(client, { type: 'status', connected: entry.pooledConnected || entry.upstream?.readyState === WebSocket.OPEN });
    } else {
      this.send(client, { type: 'snapshot', events: entry.rows,
        connected: entry.pooledConnected || entry.upstream?.readyState === WebSocket.OPEN });
    }
    if (!entry.pooledStop && !entry.upstream && !entry.reconnect) this.connect(entry);
    const current = entry;
    client.on('message', () => client.close(1008, 'Read-only stream'));
    client.on('close', () => {
      current.clients.delete(client);
      if (!this.hasViewers(current)) current.idleAt = Date.now();
    });
  }

  /**
   * Attach one browser WS to many independent market scopes. The existing
   * addClient() endpoint retains its original read-only protocol.
   */
  addBulkClient(client: WebSocket, exchange: Exchange, symbol: string, liveOnly = false): boolean {
    const key = exchange + ':' + symbol;
    let entry = this.entries.get(key);
    if (!entry && this.entries.size >= MAX_MARKETS) {
      const idle = [...this.entries.values()].filter(e => !this.hasViewers(e))
        .sort((a,b) => a.idleAt - b.idleAt)[0];
      if (idle) {
        this.stopUpstream(idle);
        this.entries.delete(idle.key);
        this.revision++;
      }
    }
    if (!entry && this.entries.size >= MAX_MARKETS) {
      this.counters.rejectedClients++;
      this.send(client, {type:'status', exchange, symbol, connected:false, capacity:true});
      return false;
    }
    if (!entry) {
      entry = this.makeEntry(exchange, symbol);
      this.entries.set(key, entry);
    }
    entry.bulkClients.add(client);
    this.prune(entry);
    const connected = entry.pooledConnected || entry.upstream?.readyState === WebSocket.OPEN;
    if (liveOnly) this.send(client,{type:'status',exchange,symbol,connected});
    else this.send(client,{type:'snapshot',exchange,symbol,connected,events:entry.rows});
    if (!entry.pooledStop && !entry.upstream && !entry.reconnect) this.connect(entry);
    return true;
  }

  removeBulkClient(client: WebSocket, exchange: Exchange, symbol: string) {
    const entry = this.entries.get(exchange + ':' + symbol);
    if (!entry) return;
    entry.bulkClients.delete(client);
    if (!this.hasViewers(entry)) entry.idleAt = Date.now();
  }

  startPersistence() {
    const timer = setInterval(() => {
      for (const [key, entry] of this.entries) {
        this.prune(entry);
        if (!this.hasViewers(entry) && Date.now() - entry.idleAt >= IDLE_GRACE_MS) {
          this.stopUpstream(entry);
          if (!entry.rows.length) {
            this.entries.delete(key);
            this.revision++;
          }
        }
      }
      void this.save();
    }, 30_000);
    timer.unref?.();
  }

  private async save(): Promise<void> {
    if (this.writing) return this.writing;
    if (this.savedRevision === this.revision) return;
    const revision = this.revision;
    const rows = Object.fromEntries([...this.entries].map(([key, entry]) => [key, entry.rows])
      .filter(([, data]) => (data as LiquidationRow[]).length));
    const pending = (async () => {
      try {
        await fs.promises.mkdir(path.dirname(STORE_FILE), { recursive: true });
        const temp = STORE_FILE + '.tmp';
        await fs.promises.writeFile(temp, JSON.stringify(rows), 'utf8');
        await fs.promises.rename(temp, STORE_FILE);
        this.savedRevision = revision;
        this.counters.savedSnapshots++;
      } catch (error) {
        this.counters.failedSaves++;
        console.warn('[LiquidationFeed] Unable to persist recent history:',
          error instanceof Error ? error.message : String(error));
      }
    })();
    this.writing = pending;
    try { await pending; } finally { this.writing = null; }
  }
}

export const liquidationFeed = new SharedLiquidationFeed();

export function installLiquidationStream(server: Server) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  server.on('upgrade', (request, socket, head) => {
    const pathname = (request.url || '').split('?')[0];
    if (pathname !== '/api/hookchart/liquidations' &&
        pathname !== '/api/hookchart/liquidations-multi') return;
    sockets.handleUpgrade(request, socket, head, client => sockets.emit('connection', client, request));
  });
  sockets.on('connection', (client, request) => {
    if (sockets.clients.size > MAX_CLIENTS) {
      client.close(1013, 'Liquidation clients capacity reached');
      return;
    }
    const url = new URL(request.url || '/', 'http://localhost');
    if (url.pathname === '/api/hookchart/liquidations-multi') {
      // 1 browser socket -> up to 64 markets, one subscription per market.
      // No client can subscribe to an arbitrary count or flood our server.
      const topics = new Set<string>();
      const MAX_TOPICS_PER_CLIENT = 64;
      let commandWindowStart = Date.now();
      let commands = 0;
      const handle = (raw: RawData) => {
        const now = Date.now();
        if (now - commandWindowStart >= 60_000) {
          commandWindowStart = now;
          commands = 0;
        }
        if (++commands > 160) {
          client.close(1008, 'Too many liquidation subscriptions');
          return;
        }
        let msg: Record<string, unknown>;
        try { msg = JSON.parse(raw.toString()); }
        catch { client.close(1008, 'Invalid liquidation request'); return; }
        if (!msg || typeof msg !== 'object' ||
            (msg.type !== 'subscribe' && msg.type !== 'unsubscribe') ||
            (msg.exchange !== 'binance' && msg.exchange !== 'bybit') ||
            typeof msg.symbol !== 'string') {
          client.close(1008, 'Invalid liquidation request');
          return;
        }
        const exchange = msg.exchange;
        const symbol = msg.symbol.trim().toUpperCase();
        if (!validSymbol(symbol)) {
          client.close(1008, 'Invalid liquidation symbol');
          return;
        }
        const scope = exchange + ':' + symbol;
        if (msg.type === 'unsubscribe') {
          if (topics.delete(scope)) liquidationFeed.removeBulkClient(client, exchange, symbol);
          return;
        }
        if (topics.has(scope)) return;
        if (topics.size >= MAX_TOPICS_PER_CLIENT) {
          client.send(JSON.stringify({
            type:'status', exchange, symbol, connected:false, capacity:true,
          }));
          return;
        }
        if (liquidationFeed.addBulkClient(client, exchange, symbol, msg.live === true)) {
          topics.add(scope);
        }
      };
      client.on('message', handle);
      client.on('close', () => {
        for (const scope of topics) {
          const sep = scope.indexOf(':');
          liquidationFeed.removeBulkClient(client,
            scope.slice(0, sep) as Exchange, scope.slice(sep + 1));
        }
        topics.clear();
      });
      return;
    }
    const exchange = url.searchParams.get('exchange');
    const symbol = (url.searchParams.get('symbol') || '').trim().toUpperCase();
    if ((exchange !== 'binance' && exchange !== 'bybit') || !validSymbol(symbol)) {
      client.close(1008, 'Invalid exchange or symbol');
      return;
    }
    liquidationFeed.addClient(client, exchange, symbol, url.searchParams.get('live') === '1');
  });
  liquidationFeed.startPersistence();
  return liquidationFeed;
}
