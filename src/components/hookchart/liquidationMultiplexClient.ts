import type { ExchangeId } from '../../types';
import type { Liquidation } from './engine';

type Listener = {
  exchange: ExchangeId;
  symbol: string;
  onSnapshot: (events: Liquidation[], connected: boolean) => void;
  onLiquidation: (event: Liquidation) => void;
  onStatus: (connected: boolean) => void;
};

function validRow(value: unknown): value is Liquidation {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && row.id.length < 180 &&
    (row.side === 'LONG' || row.side === 'SHORT') &&
    typeof row.t === 'number' && Number.isSafeInteger(row.t) &&
    typeof row.p === 'number' && Number.isFinite(row.p) && row.p > 0 &&
    typeof row.q === 'number' && Number.isFinite(row.q) && row.q > 0 &&
    typeof row.usd === 'number' && Number.isFinite(row.usd) && row.usd > 0;
}

/**
 * Browser-only optional upgrade: one socket carries multiple coin streams.
 * No render timers or network requests exist until a chart subscribes.
 * The legacy transport remains the default until VPS rollout validates this.
 */
export function createMultiplexBrowserLiquidations(
  socketFactory: (url: string) => WebSocket = url => new WebSocket(url),
) {
  const listeners = new Map<string, Listener>();
  let socket: WebSocket | null = null;
  let reconnect: ReturnType<typeof setTimeout> | null = null;
  let firstSnapshotTimer: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;
  const hadSnapshot = new Set<string>();
  const keyOf = (exchange: ExchangeId, symbol: string) => exchange + ':' + symbol.toUpperCase();
  const setStatus = (connected: boolean) => {
    for (const sub of [...listeners.values()])
      try { sub.onStatus(connected); } catch {}
  };
  const clearTimers = () => {
    if (reconnect) clearTimeout(reconnect);
    if (firstSnapshotTimer) clearTimeout(firstSnapshotTimer);
    reconnect = null;
    firstSnapshotTimer = null;
  };
  const transmit = (type: 'subscribe' | 'unsubscribe', sub: Listener) => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(JSON.stringify({
        type, exchange: sub.exchange, symbol: sub.symbol.toUpperCase(),
      }));
    } catch {}
  };
  // A socket can already be open when another chart subscribes. Every newly
  // added market still needs its own first-snapshot deadline; without this
  // watchdog it could remain silently empty until the whole socket reconnects.
  const armSnapshotDeadline = () => {
    if (firstSnapshotTimer) clearTimeout(firstSnapshotTimer);
    firstSnapshotTimer = null;
    const current = socket;
    if (!current || current.readyState !== WebSocket.OPEN ||
        ![...listeners.keys()].some(key => !hadSnapshot.has(key))) return;
    firstSnapshotTimer = setTimeout(() => {
      firstSnapshotTimer = null;
      if (socket === current && [...listeners.keys()].some(key => !hadSnapshot.has(key)))
        try { current.close(); } catch {}
    }, 15_000);
  };
  const schedule = () => {
    if (!listeners.size || reconnect) return;
    const wait = Math.min(30_000, 1000 * 2 ** Math.min(attempts++, 5));
    reconnect = setTimeout(() => {
      reconnect = null;
      connect();
    }, wait + Math.floor(Math.random() * 250));
  };
  const connect = () => {
    if (!listeners.size || socket) return;
    if (typeof window === 'undefined') return;
    const url = new URL('/api/hookchart/liquidations-multi', window.location.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    let current: WebSocket;
    try { current = socketFactory(url.toString()); }
    catch { schedule(); return; }
    socket = current;
    const disconnect = () => {
      if (socket !== current) return;
      socket = null;
      if (firstSnapshotTimer) clearTimeout(firstSnapshotTimer);
      firstSnapshotTimer = null;
      hadSnapshot.clear();
      // The error event does not guarantee that a browser WebSocket closed.
      // Close it to avoid an orphaned connection after scheduling a retry.
      try { current.close(); } catch {}
      setStatus(false);
      schedule();
    };
    current.onopen = () => {
      if (socket !== current) return;
      hadSnapshot.clear();
      for (const sub of listeners.values()) transmit('subscribe',sub);
      armSnapshotDeadline();
    };
    current.onmessage = event => {
      if (socket !== current) return;
      let packet: Record<string, unknown>;
      try { packet = JSON.parse(String(event.data)); }
      catch { return; }
      if (!packet || (packet.exchange !== 'binance' && packet.exchange !== 'bybit') ||
          typeof packet.symbol !== 'string') return;
      const k = keyOf(packet.exchange, packet.symbol);
      const sub = listeners.get(k);
      if (!sub) return;
      if (packet.type === 'snapshot' && Array.isArray(packet.events)) {
        hadSnapshot.add(k);
        // A partial resync is not a healthy connection. Keep exponential
        // backoff if another subscribed market never receives its snapshot;
        // otherwise one responsive coin resets retries on every failed loop.
        if (hadSnapshot.size === listeners.size) {
          attempts = 0;
          armSnapshotDeadline();
        }
        const rows = packet.events.slice(-1500).filter(validRow);
        try { sub.onSnapshot(rows, packet.connected === true); } catch {}
      } else if (packet.type === 'liquidation' && validRow(packet.event)) {
        try { sub.onLiquidation(packet.event); } catch {}
      } else if (packet.type === 'status') {
        // Capacity denial is a final response for this subscription, not
        // a lost snapshot. Reconnecting the whole shared socket repeatedly
        // would interrupt the healthy markets and overload the VPS.
        if (packet.capacity === true) {
          hadSnapshot.add(k);
          if (hadSnapshot.size === listeners.size) armSnapshotDeadline();
        }
        try { sub.onStatus(packet.connected === true); } catch {}
      }
    };
    current.onclose = disconnect;
    current.onerror = disconnect;
  };
  const subscribe = (listener: Listener): (() => void) => {
    const key = keyOf(listener.exchange, listener.symbol);
    // The caller's sharedLiquidationStream already deduplicates each scope.
    if (listeners.has(key)) throw new Error('Duplicate browser liquidation subscription');
    listeners.set(key, listener);
    try { listener.onStatus(false); } catch {}
    if (socket?.readyState === WebSocket.OPEN) {
      transmit('subscribe',listener);
      armSnapshotDeadline();
    } else connect();
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      listeners.delete(key);
      hadSnapshot.delete(key);
      transmit('unsubscribe', listener);
      if (listeners.size) { armSnapshotDeadline(); return; }
      clearTimers();
      const old = socket;
      socket = null;
      if (old) try { old.close(); } catch {}
    };
  };
  return {subscribe, activeScopes: () => listeners.size};
}

export const multiplexBrowserLiquidations = createMultiplexBrowserLiquidations();
