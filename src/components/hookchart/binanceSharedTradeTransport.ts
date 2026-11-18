/**
 * Public Binance aggTrade transport shared across same-origin browser
 * tabs or Desktop panes. Only market data is relayed; no orders or account
 * data. Binance aggregate trade IDs are checked by the consumer so duplicated
 * owner/fallback messages cannot inflate delta or volume.
 */
export type BinanceTradePacket = {
  id: string; t: number; p: number; q: number; side: 'BUY' | 'SELL';
};
export type BinanceTradeScope = { marketType: 'futures' | 'spot'; symbol: string };
export type SharedTradeChannel = {
  postMessage(packet: unknown): void;
  addEventListener(type: 'message', callback: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', callback: (event: MessageEvent) => void): void;
  close(): void;
};
export type SharedTradeSocket = { close(): void };
export type SharedTradeSocketFactory = (
  scope: BinanceTradeScope,
  onTrade: (trade: BinanceTradePacket) => void,
  onConnected: (connected: boolean) => void,
) => SharedTradeSocket;

const HEARTBEAT_MS = 2_000;
const OWNER_TIMEOUT_MS = 7_000;
const CHANNEL_LABEL = 'h00k-public-binance-aggtrade-v1:';

type Packet = {
  type: 'hello' | 'heartbeat' | 'trade' | 'bye';
  key: string;
  sender: string;
  at: number;
  connected?: boolean;
  trade?: BinanceTradePacket;
};

export function isValidBinanceTradePacket(item: unknown, now = Date.now()): item is BinanceTradePacket {
  if (!item || typeof item !== 'object') return false;
  const trade = item as Partial<BinanceTradePacket>;
  return typeof trade.id === 'string' && /^\d{1,20}$/.test(trade.id) &&
    Number.isSafeInteger(Number(trade.id)) &&
    Number.isSafeInteger(trade.t) && (trade.t ?? 0) > 0 &&
    (trade.t ?? 0) <= now + 5000 && (trade.t ?? 0) >= now - 300_000 &&
    Number.isFinite(trade.p) && (trade.p ?? 0) > 0 &&
    Number.isFinite(trade.q) && (trade.q ?? 0) > 0 &&
    (trade.side === 'BUY' || trade.side === 'SELL');
}

export function isSharedBinanceScope(scope: BinanceTradeScope): boolean {
  return (scope.marketType === 'futures' || scope.marketType === 'spot') &&
    /^[\p{L}\p{M}\p{N}]{3,30}$/u.test(scope.symbol);
}

export function createSharedBinanceTradeTransport(options: {
  channel: (name: string) => SharedTradeChannel;
  lock: (name: string, signal: AbortSignal, task: () => Promise<void>) => Promise<void>;
  socket: SharedTradeSocketFactory;
  every?: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearEvery?: (timer: ReturnType<typeof setInterval>) => void;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const every = options.every ?? ((fn, ms) => setInterval(fn, ms));
  const clearEvery = options.clearEvery ?? clearInterval;
  const active = new Map<string, { stop: () => void }>();
  const sender = 'tab-' + Math.random().toString(36).slice(2) + '-' + now();

  const subscribe = (
    scope: BinanceTradeScope,
    onTrade: (trade: BinanceTradePacket) => void,
    onStatus: (connected: boolean) => void = () => {},
  ): (() => void) => {
    if (!isSharedBinanceScope(scope)) throw new Error('Invalid market scope');
    const key = [scope.marketType, scope.symbol.toUpperCase()].join(':');
    if (active.has(key)) throw new Error('Already subscribed: ' + key);
    const channel = options.channel(CHANNEL_LABEL + key);
    const abort = new AbortController();
    let closed = false;
    let owner = false;
    let leaderId: string | null = null;
    let lastOwnerAt = now();
    let ownerConnected = false;
    let fallbackConnected = false;
    let browserConnected = false;
    const reportStatus = (connected: boolean) => {
      if (browserConnected === connected) return;
      browserConnected = connected;
      try { onStatus(connected); } catch { /* status listeners cannot break exchange relay */ }
    };
    let direct: SharedTradeSocket | null = null;
    let fallback: SharedTradeSocket | null = null;
    let releaseLock: (() => void) | null = null;

    const send = (type: Packet['type'], extra: Partial<Packet> = {}) => {
      if (closed) return;
      try { channel.postMessage({ type, key, sender, at: now(), ...extra } satisfies Packet); }
      catch { /* follower will fail open */ }
    };
    const closeSocket = (socket: SharedTradeSocket | null) => {
      try { socket?.close(); } catch { /* already disconnected */ }
    };
    const stopDirect = () => {
      const stop = direct; direct = null;
      closeSocket(stop);
    };
    const stopFallback = () => {
      const stop = fallback; fallback = null;
      fallbackConnected = false;
      closeSocket(stop);
    };
    const startSocket = (asOwner: boolean) => {
      if (closed || (asOwner ? direct : fallback)) return;
      try {
        const socket = options.socket(scope, trade => {
          if (closed || owner !== asOwner || !isValidBinanceTradePacket(trade, now())) return;
          try { onTrade(trade); } catch { /* do not break upstream */ }
          if (asOwner) send('trade', { trade });
        }, connected => {
          if (closed || owner !== asOwner) return;
          if (asOwner) {
            ownerConnected = connected;
            reportStatus(connected);
            send('heartbeat', { connected });
          } else {
            fallbackConnected = connected;
            reportStatus(connected || ownerConnected);
          }
        });
        if (closed || owner !== asOwner) { socket.close(); return; }
        if (asOwner) direct = socket;
        else fallback = socket;
      } catch { /* watchdog retries fallback and owner WS reconnects internally */ }
    };

    const onMessage = (event: MessageEvent) => {
      const msg = event.data as Partial<Packet> | null;
      if (closed || !msg || typeof msg !== 'object' || msg.key !== key ||
        typeof msg.sender !== 'string' || msg.sender === sender ||
        msg.sender.length > 100 || !Number.isFinite(msg.at) ||
        Math.abs(now() - (msg.at ?? 0)) > 5_000) return;
      if (msg.type === 'hello') {
        if (owner) send('heartbeat', { connected: ownerConnected });
        return;
      }
      if (owner) return;
      if (msg.type === 'bye') {
        if (msg.sender === leaderId) {
          leaderId = null;
          lastOwnerAt = 0;
          ownerConnected = false;
          reportStatus(fallbackConnected);
          // A queued Web Lock may hand ownership to this tab immediately.
          // Allow the watchdog to open a direct fallback if election stalls.
          // Opening one here creates a redundant transient socket.
        }
        return;
      }
      if (msg.type !== 'heartbeat' && msg.type !== 'trade') return;
      if (leaderId && leaderId !== msg.sender && now() - lastOwnerAt < OWNER_TIMEOUT_MS) return;
      leaderId = msg.sender;
      lastOwnerAt = now();
      if (msg.type === 'heartbeat') {
        ownerConnected = msg.connected === true;
        reportStatus(ownerConnected || fallbackConnected);
        if (!ownerConnected) startSocket(false);
        return;
      }
      if (!isValidBinanceTradePacket(msg.trade, now())) return;
      stopFallback();
      ownerConnected = true;
      reportStatus(true);
      try { onTrade(msg.trade); } catch { /* broken consumer cannot break relay */ }
    };
    channel.addEventListener('message', onMessage);
    send('hello');

    const watcher = every(() => {
      if (closed) return;
      if (owner) {
        send('heartbeat', { connected: ownerConnected });
      } else if (!leaderId || now() - lastOwnerAt > OWNER_TIMEOUT_MS) {
        ownerConnected = false;
        reportStatus(fallbackConnected);
        startSocket(false);
      } else if (!ownerConnected) {
        startSocket(false);
      }
    }, HEARTBEAT_MS);

    void options.lock(CHANNEL_LABEL + key, abort.signal, async () => {
      if (closed) return;
      owner = true;
      leaderId = sender;
      ownerConnected = false;
      stopFallback();
      reportStatus(false);
      send('heartbeat', { connected: false });
      startSocket(true);
      try {
        await new Promise<void>(resolve => { releaseLock = resolve; });
      } finally {
        releaseLock = null;
        stopDirect();
        owner = false;
      }
    }).catch(() => {
      if (!closed && !owner) startSocket(false);
    });

    const stop = () => {
      if (closed) return;
      if (owner) send('bye');
      reportStatus(false);
      closed = true;
      abort.abort();
      stopFallback();
      stopDirect();
      releaseLock?.();
      releaseLock = null;
      clearEvery(watcher);
      channel.removeEventListener('message', onMessage);
      channel.close();
      active.delete(key);
    };
    active.set(key, { stop });
    return stop;
  };

  return { subscribe, activeScopes: () => active.size };
}
