import WebSocket from 'ws';

export type LiquidationExchange = 'binance' | 'bybit';
export type UpstreamCallbacks = {
  onPacket: (packet: unknown) => void;
  onStatus: (connected: boolean) => void;
};
type Command = { op: 'subscribe' | 'unsubscribe'; symbols: string[]; id: string };
type Topic = { callbacks: UpstreamCallbacks; connected: boolean };
type Shard = {
  exchange: LiquidationExchange; topics: Map<string, Topic>;
  socket: WebSocket | null;
  reconnect: ReturnType<typeof setTimeout> | null;
  sending: ReturnType<typeof setInterval> | null;
  ping: ReturnType<typeof setInterval> | null;
  commands: Command[];
  acks: Map<string, Command>;
  failures: number;
};
type WebSocketFactory = (url: string) => WebSocket;

/**
 * One Binance or Bybit public liquidation WebSocket per 64 symbols, rather
 * than one *exchange connection* for every charted market.
 *
 * Every symbol still has one stream subscription. This is multiplexing, not
 * claiming the public API publishes all exchange liquidations or all tokens.
 * The browser-facing /api/hookchart/liquidations protocol remains unchanged.
 */
export class SharedLiquidationUpstreamPool {
  private readonly shards: Record<LiquidationExchange, Shard[]> = { binance: [], bybit: [] };
  private requestId = 0;
  private createdConnections = 0;
  private reconnects = 0;
  private rejectedTopics = 0;
  constructor(
    private readonly socketFactory: WebSocketFactory =
      url => new WebSocket(url, { handshakeTimeout: 10_000, perMessageDeflate: false }),
    private readonly maxTopicsPerSocket = 64,
  ) {}

  stats() {
    const all = [...this.shards.binance, ...this.shards.bybit];
    return {
      upstreamSockets: all.filter(s => s.socket?.readyState === WebSocket.OPEN).length,
      connectingSockets: all.filter(s => s.socket?.readyState === WebSocket.CONNECTING).length,
      shards: all.length,
      subscribedTopics: all.reduce((n, shard) => n + shard.topics.size, 0),
      createdConnections: this.createdConnections,
      reconnects: this.reconnects,
      rejectedTopics: this.rejectedTopics,
    };
  }

  subscribe(exchange: LiquidationExchange, symbol: string, callbacks: UpstreamCallbacks): () => void {
    let shard = this.shards[exchange].find(s => s.topics.size < this.maxTopicsPerSocket);
    if (!shard) {
      shard = {
        exchange, topics: new Map(), socket: null, reconnect: null,
        sending: null, ping: null, commands: [], acks: new Map(), failures: 0,
      };
      this.shards[exchange].push(shard);
    }
    if (shard.topics.has(symbol)) throw new Error('Duplicate liquidation upstream topic');
    shard.topics.set(symbol, { callbacks, connected: false });
    // A subscriber never mistakes a connecting socket for a subscribed topic.
    try { callbacks.onStatus(false); } catch {}
    if (shard.socket?.readyState === WebSocket.OPEN) {
      this.queue(shard, 'subscribe', [symbol]);
    } else if (!shard.socket && !shard.reconnect) this.connect(shard);

    const current = shard;
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      const topic = current.topics.get(symbol);
      if (!topic || topic.callbacks !== callbacks) return;
      current.topics.delete(symbol);
      if (!current.topics.size) {
        this.stopShard(current);
        const group = this.shards[exchange];
        const index = group.indexOf(current);
        if (index >= 0) group.splice(index, 1);
      } else if (current.socket?.readyState === WebSocket.OPEN) {
        this.queue(current, 'unsubscribe', [symbol]);
      }
    };
  }

  private status(shard: Shard, symbol: string, connected: boolean) {
    const sub = shard.topics.get(symbol);
    if (!sub || sub.connected === connected) return;
    sub.connected = connected;
    try { sub.callbacks.onStatus(connected); } catch {}
  }

  private queue(shard: Shard, op: Command['op'], symbols: string[]) {
    // Use small batches: well below Bybit's 21k args payload and Binance's
    // incoming-message rate. Sending is limited to five messages per second.
    for (let i = 0; i < symbols.length; i += 16) {
      shard.commands.push({
        op, symbols: symbols.slice(i, i + 16), id: String(++this.requestId),
      });
    }
    this.startSending(shard);
  }

  private startSending(shard: Shard) {
    if (shard.sending || !shard.commands.length) return;
    shard.sending = setInterval(() => {
      const socket = shard.socket;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      const cmd = shard.commands.shift();
      if (!cmd) {
        if (shard.sending) clearInterval(shard.sending);
        shard.sending = null;
        return;
      }
      const body = shard.exchange === 'binance'
        ? {
          method: cmd.op === 'subscribe' ? 'SUBSCRIBE' : 'UNSUBSCRIBE',
          params: cmd.symbols.map(s => s.toLowerCase() + '@forceOrder'),
          id: Number(cmd.id),
        }
        : {
          op: cmd.op, req_id: cmd.id,
          args: cmd.symbols.map(s => 'allLiquidation.' + s),
        };
      try {
        shard.acks.set(cmd.id, cmd);
        socket.send(JSON.stringify(body));
      } catch {
        shard.acks.delete(cmd.id);
        shard.commands.unshift(cmd);
        try { socket.terminate(); } catch {}
      }
    }, 200);
    shard.sending.unref?.();
  }

  private onMessage(shard: Shard, packet: unknown) {
    if (!packet || typeof packet !== 'object') return;
    const msg = packet as Record<string, any>;
    // Binance uses numeric id / result:null; Bybit uses req_id / success.
    const ackId = msg.req_id ?? msg.id;
    if (ackId !== undefined && shard.acks.has(String(ackId))) {
      const cmd = shard.acks.get(String(ackId))!;
      shard.acks.delete(String(ackId));
      const ok = shard.exchange === 'binance'
        ? msg.result === null && !msg.error && !msg.code
        : msg.success === true;
      const failed = new Set<string>();
      if (Array.isArray(msg.data?.failTopics)) for (const topic of msg.data.failTopics) {
        if (typeof topic === 'string') failed.add(topic.replace(/^allLiquidation\./, ''));
      }
      for (const symbol of cmd.symbols) {
        const accepted = ok && !failed.has(symbol);
        if (!accepted) this.rejectedTopics++;
        if (cmd.op === 'subscribe') this.status(shard, symbol, accepted);
        else if (accepted) this.status(shard, symbol, false);
      }
      return;
    }
    const event = shard.exchange === 'binance'
      ? msg.data && typeof msg.data === 'object' ? msg.data : msg
      : msg;
    const symbol = shard.exchange === 'binance'
      ? typeof event?.o?.s === 'string' ? event.o.s.toUpperCase() : null
      : typeof event?.topic === 'string' && event.topic.startsWith('allLiquidation.')
        ? event.topic.slice('allLiquidation.'.length).toUpperCase() : null;
    if (!symbol) return;
    // A plausible topic name alone does not prove that a subscription is
    // delivering liquidation data. Malformed or unrelated packets must not
    // flip the chart to LIVE, especially when the exchange omitted its ACK.
    if (shard.exchange === 'binance'
      ? event?.e !== 'forceOrder'
      : !Array.isArray(event?.data)) return;
    const target = shard.topics.get(symbol);
    if (!target) return;
    // A valid exchange liquidation packet (even an empty Bybit batch) also
    // confirms the topic when the provider has omitted the subscription ACK.
    this.status(shard, symbol, true);
    try { target.callbacks.onPacket(event); } catch {}
  }

  private connect(shard: Shard) {
    if (shard.socket || !shard.topics.size) return;
    const url = shard.exchange === 'binance'
      ? 'wss://fstream.binance.com/market/stream'
      : 'wss://stream.bybit.com/v5/public/linear';
    let socket: WebSocket;
    try { socket = this.socketFactory(url); }
    catch { this.retry(shard); return; }
    shard.socket = socket;
    this.createdConnections++;
    socket.on('open', () => {
      if (shard.socket !== socket) return;
      shard.failures = 0;
      shard.acks.clear();
      shard.commands = [];
      this.queue(shard, 'subscribe', [...shard.topics.keys()]);
      if (shard.exchange === 'bybit') {
        shard.ping = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN)
            try { socket.send(JSON.stringify({ op: 'ping' })); } catch {}
        }, 20_000);
        shard.ping.unref?.();
      }
    });
    socket.on('message', data => {
      if (shard.socket !== socket) return;
      try { this.onMessage(shard, JSON.parse(data.toString())); } catch {}
    });
    socket.on('error', () => {
      if (shard.socket === socket) try { socket.terminate(); } catch {}
    });
    socket.on('close', () => {
      if (shard.socket !== socket) return;
      shard.socket = null;
      if (shard.ping) clearInterval(shard.ping);
      shard.ping = null;
      if (shard.sending) clearInterval(shard.sending);
      shard.sending = null;
      shard.commands = [];
      shard.acks.clear();
      for (const symbol of shard.topics.keys()) this.status(shard, symbol, false);
      if (shard.topics.size) this.retry(shard);
    });
  }

  private retry(shard: Shard) {
    if (shard.reconnect || !shard.topics.size) return;
    const wait = Math.min(30_000, 1500 * 2 ** Math.min(shard.failures++, 5));
    this.reconnects++;
    shard.reconnect = setTimeout(() => {
      shard.reconnect = null;
      if (shard.topics.size) this.connect(shard);
    }, wait + Math.floor(Math.random() * 500));
    shard.reconnect.unref?.();
  }

  private stopShard(shard: Shard) {
    if (shard.reconnect) clearTimeout(shard.reconnect);
    if (shard.sending) clearInterval(shard.sending);
    if (shard.ping) clearInterval(shard.ping);
    shard.reconnect = null;
    shard.sending = null;
    shard.ping = null;
    shard.commands = [];
    shard.acks.clear();
    const current = shard.socket;
    shard.socket = null;
    if (current) try { current.terminate(); } catch {}
  }

  close() {
    for (const exchange of ['binance', 'bybit'] as const) {
      for (const shard of this.shards[exchange]) this.stopShard(shard);
      this.shards[exchange].length = 0;
    }
  }
}

export const sharedLiquidationUpstreams = new SharedLiquidationUpstreamPool();
