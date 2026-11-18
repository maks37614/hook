import type { ExchangeId } from '../../types';
import type { Liquidation } from './engine';
import { isValidExchangeSymbol, normalizeExchangeSymbol } from '../../utils/marketSymbols';

/**
 * Desktop-only, read-only public liquidations fanout. This sits ABOVE the
 * existing per-tab sharedLiquidationStream: that layer still performs the
 * authoritative cumulative-ID deduplication and local session accounting.
 * No private payloads, orders, chart settings or persistent storage.
 */
export type DesktopLiqScope = {
  exchange: ExchangeId;
  symbol: string;
  onSnapshot: (rows: Liquidation[], connected: boolean) => void;
  onLiquidation: (event: Liquidation) => void;
  onStatus: (connected: boolean) => void;
};
export interface DesktopLiqChannel {
  postMessage(data: unknown): void;
  addEventListener(type: 'message', callback: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: 'message', callback: (event: MessageEvent<unknown>) => void): void;
  close(): void;
}
export type DesktopLiqLock = (
  name: string, signal: AbortSignal, task: () => Promise<void>,
) => Promise<void>;
type Source = (options: DesktopLiqScope) => () => void;
type Packet = {
  type: 'hello' | 'heartbeat' | 'snapshot' | 'event' | 'status' | 'bye';
  scope: string; sender: string; sentAt: number;
  connected?: boolean; rows?: Liquidation[]; event?: Liquidation;
  recipient?: string; eventNo?: number;
};
const MAX_SCOPES = 80;
const MAX_KEYS = 1500;
const MAX_SCOPE_LENGTH = 100;
const RETAIN_MS = 30 * 60_000;
const HEARTBEAT_MS = 2_000;
const PEER_TIMEOUT_MS = 7_000;
const FIRST_SNAPSHOT_WAIT_MS = 15_000;
const PEER_OFFLINE_WAIT_MS = 15_000;

function recent(now: number, timestamp: number, ttlMs: number): boolean {
  return Number.isFinite(timestamp) && timestamp <= now + 2_000 && now - timestamp < ttlMs;
}
function validRow(value: unknown): value is Liquidation {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return typeof r.id === 'string' && r.id.length > 0 && r.id.length < 180 &&
    (r.side === 'LONG' || r.side === 'SHORT') &&
    // Exchange event timestamps are not bounded by the computer clock.
    // A skewed Windows clock must never suppress a real liquidation.
    typeof r.t === 'number' && Number.isSafeInteger(r.t) && r.t > 0 &&
    typeof r.p === 'number' && Number.isFinite(r.p) && r.p > 0 &&
    typeof r.q === 'number' && Number.isFinite(r.q) && r.q > 0 &&
    typeof r.usd === 'number' && Number.isFinite(r.usd) && r.usd > 0;
}

/** Bounded retention without sorting/iterating on every real-time fill.
 * Opportunistically prune after 2 seconds; a subscriber/replay always forces
 * a fresh sweep. A source may remain quiet for hours, so joins cannot rely
 * on receiving another liquidation to expire its history. */
function pruneRows(
  entry: { rows: Map<string, Liquidation>; lastPrunedAt: number },
  timestamp: number,
  force = false,
): void {
  if (force || timestamp < entry.lastPrunedAt ||
      timestamp - entry.lastPrunedAt >= 2_000) {
    const cutoff = timestamp - RETAIN_MS;
    for (const [id, row] of entry.rows) {
      if (row.t < cutoff) entry.rows.delete(id);
    }
    entry.lastPrunedAt = timestamp;
  }
  if (entry.rows.size > MAX_KEYS) {
    const oldest = [...entry.rows].sort((a, b) => a[1].t - b[1].t);
    for (let i = 0; i < oldest.length - MAX_KEYS; i++) entry.rows.delete(oldest[i][0]);
  }
}

export function createDesktopLiquidationBridge(options: {
  createChannel: (name: string) => DesktopLiqChannel;
  lock: DesktopLiqLock;
  source: Source;
  now?: () => number;
  every?: (callback: () => void, ms: number) => ReturnType<typeof setInterval>;
  cancelEvery?: (timer: ReturnType<typeof setInterval>) => void;
}) {
  const now = options.now ?? Date.now;
  const every = options.every || ((callback: () => void, ms: number) => setInterval(callback, ms));
  const cancelEvery = options.cancelEvery || ((timer: ReturnType<typeof setInterval>) => clearInterval(timer));
  const sender = 'renderer-' + Math.random().toString(36).slice(2) + '-' + now().toString(36);
  type Entry = {
    listeners: Set<DesktopLiqScope>; rows: Map<string, Liquidation>;
    hasSnapshot: boolean; connected: boolean; lastPrunedAt: number; stop: () => void;
  };
  const subscriptions = new Map<string, Entry>();

  const subscribe = (listener: DesktopLiqScope): (() => void) => {
    const symbol = normalizeExchangeSymbol(listener.symbol);
    const key = listener.exchange + ':' + symbol;
    if (!['binance', 'bybit'].includes(listener.exchange) ||
        !isValidExchangeSymbol(symbol) ||
        symbol !== listener.symbol.toUpperCase() ||
        key.length > MAX_SCOPE_LENGTH ||
        (subscriptions.size >= MAX_SCOPES && !subscriptions.has(key))) {
      return options.source(listener);
    }
    const existing = subscriptions.get(key);
    if (existing) {
      // A quiet market can stay connected for hours without a new liquidation.
      // Do not replay expired rows into a newly opened HookChart.
      pruneRows(existing, now(), true);
      existing.listeners.add(listener);
      try {
        if (existing.hasSnapshot) listener.onSnapshot([...existing.rows.values()], existing.connected);
        else listener.onStatus(false);
      } catch { /* an individual HookChart must never break another */ }
      return () => {
        existing.listeners.delete(listener);
        if (!existing.listeners.size && subscriptions.get(key) === existing) {
          subscriptions.delete(key);
          existing.stop();
        }
      };
    }
    let channel: DesktopLiqChannel;
    try { channel = options.createChannel('h00k-desktop-public-liq-v1:' + key); }
    catch { return options.source(listener); }
    let closed = false, leader = false;
    let activeLeader: string | null = null;
    let lastLeaderAt = 0, leaderSeenAt = now(), peerHasSnapshot = false;
    let peerOfflineSince = 0;
    // Per-owner contiguous event counter detects a lost BroadcastChannel
    // liquidation, which otherwise silently understates Liq totals.
    let publishedEventNo = 0, receivedEventNo = 0;
    let upstream: (() => void) | null = null;
    let fallback: (() => void) | null = null;
    let releaseLock: (() => void) | null = null;
    const abort = new AbortController();
    const entry: Entry = { listeners: new Set([listener]), rows: new Map(),
      connected: false, hasSnapshot: false, lastPrunedAt: 0, stop: () => {} };
    subscriptions.set(key, entry);

    const notifyStatus = (connected: boolean) => {
      if (entry.connected === connected) return;
      entry.connected = connected;
      for (const sub of [...entry.listeners]) {
        try { sub.onStatus(connected); } catch {}
      }
    };
    const trim = (force = false) => pruneRows(entry, now(), force);
    const remember = (row: Liquidation): boolean => {
      if (!validRow(row)) return false;
      const old = entry.rows.get(row.id);
      if (old && row.usd <= old.usd) return false;
      entry.rows.set(row.id, row);
      // O(1) fast path in active markets; sweep stale history at most once
      // every 2s and enforce the row cap immediately when necessary.
      trim();
      return true;
    };
    const applySnapshot = (rows: Liquidation[], connected: boolean): boolean => {
      if (!Array.isArray(rows) || rows.length > MAX_KEYS) return false;
      if (rows.some(row => !validRow(row))) return false;
      for (const row of rows) remember(row);
      trim(true);
      entry.hasSnapshot = true;
      entry.connected = connected;
      const merged = [...entry.rows.values()];
      for (const sub of [...entry.listeners]) {
        try { sub.onSnapshot(merged, connected); } catch {}
      }
      return true;
    };
    const applyEvent = (row: Liquidation) => {
      if (!remember(row)) return false;
      for (const sub of [...entry.listeners]) {
        try { sub.onLiquidation(row); } catch {}
      }
      return true;
    };
    const publish = (type: Packet['type'], more: Partial<Packet> = {}) => {
      if (closed) return;
      try { channel.postMessage({ type, scope: key, sender, sentAt: now(), ...more } satisfies Packet); }
      catch { /* leave original network fallback available */ }
    };
    const stopFallback = () => {
      const stop = fallback; fallback = null;
      try { stop?.(); } catch {}
    };
    const stopUpstream = () => {
      const stop = upstream; upstream = null;
      try { stop?.(); } catch {}
    };
    const startSource = (asLeader: boolean) => {
      if (closed || (asLeader ? upstream : fallback)) return;
      const callbacks: DesktopLiqScope = {
        exchange: listener.exchange, symbol,
        onSnapshot: (rows, connected) => {
          if (closed || leader !== asLeader) return;
          if (!applySnapshot(rows, connected)) return;
          if (asLeader) publish('snapshot', {
            rows: [...entry.rows.values()], connected, eventNo: publishedEventNo,
          });
        },
        onLiquidation: row => {
          if (closed || leader !== asLeader || !entry.hasSnapshot || !entry.connected) return;
          if (applyEvent(row) && asLeader) {
            publishedEventNo++;
            publish('event', { event: row, eventNo: publishedEventNo });
          }
        },
        onStatus: connected => {
          if (closed || leader !== asLeader) return;
          if (!connected) entry.hasSnapshot = false;
          notifyStatus(connected);
          if (asLeader) publish('status', { connected });
        },
      };
      try {
        const stop = options.source(callbacks);
        if (closed || leader !== asLeader) { stop(); return; }
        if (asLeader) upstream = stop; else fallback = stop;
      } catch { notifyStatus(false); }
    };
    const onMessage = (event: MessageEvent<unknown>) => {
      const packet = event.data as Partial<Packet> | null;
      if (closed || !packet || typeof packet !== 'object' ||
          packet.scope !== key || packet.sender === sender ||
          typeof packet.sender !== 'string' || packet.sender.length > 90 ||
          !recent(now(), packet.sentAt ?? NaN, 5_000)) return;
      if (packet.type === 'hello') {
        if (leader) {
          trim(true);
          publish('heartbeat', { connected: entry.connected });
          if (entry.hasSnapshot)
            publish('snapshot', {
              rows: [...entry.rows.values()], connected: entry.connected,
              eventNo: publishedEventNo, recipient: packet.sender,
            });
        }
        return;
      }
      if (leader) return;
      if (packet.recipient && packet.recipient !== sender) return;
      if (packet.type === 'bye') {
        if (activeLeader === packet.sender) {
          activeLeader = null; lastLeaderAt = 0; peerHasSnapshot = false;
          receivedEventNo = 0;
          peerOfflineSince = 0;
          if (!fallback) notifyStatus(false);
        }
        return;
      }
      if (!['heartbeat', 'snapshot', 'event', 'status'].includes(packet.type ?? '')) return;
      if (activeLeader && activeLeader !== packet.sender &&
          recent(now(), lastLeaderAt, PEER_TIMEOUT_MS)) return;
      if (activeLeader !== packet.sender) {
        activeLeader = packet.sender;
        leaderSeenAt = now();
        peerHasSnapshot = false;
        receivedEventNo = 0;
        peerOfflineSince = 0;
        if (!fallback) notifyStatus(false);
        // Cached historical rows are retained for cumulative liquidation IDs.
      }
      lastLeaderAt = now();
      // A responsive renderer can still have a disconnected exchange relay.
      // Never let its heartbeat conceal an offline source indefinitely.
      if ((packet.type === 'status' || packet.type === 'heartbeat') &&
          packet.connected === false) {
        if (!peerOfflineSince) peerOfflineSince = now();
      } else if ((packet.type === 'status' || packet.type === 'heartbeat') &&
          packet.connected === true) {
        peerOfflineSince = 0;
      }
      if (packet.type === 'snapshot' && Array.isArray(packet.rows) &&
          typeof packet.connected === 'boolean' &&
          Number.isSafeInteger(packet.eventNo) && (packet.eventNo ?? -1) >= 0) {
        // A disconnected owner's cache may contain valid historical events,
        // but must never downgrade a *live* direct recovery stream to OFFLINE.
        // Keep that fallback authoritative until the owner supplies a real
        // connected snapshot; old cumulative fill amounts are preserved.
        if (fallback && packet.connected === false) {
          if (packet.rows.length <= MAX_KEYS &&
              packet.rows.every(row => validRow(row))) {
            for (const row of packet.rows) remember(row);
            trim();
            peerHasSnapshot = true;
            receivedEventNo = packet.eventNo!;
            peerOfflineSince ||= now();
          }
        } else if (applySnapshot(packet.rows, packet.connected)) {
          peerHasSnapshot = true;
          receivedEventNo = packet.eventNo!;
          peerOfflineSince = packet.connected ? 0 : (peerOfflineSince || now());
          if (packet.connected && fallback) stopFallback();
        }
      } else if (packet.type === 'event' && peerHasSnapshot &&
          validRow(packet.event)) {
        if (!Number.isSafeInteger(packet.eventNo) ||
            packet.eventNo !== receivedEventNo + 1) {
          // A skipped message may omit an entire liquidation or a larger
          // cumulative fill. Never keep calculating from an incomplete feed.
          peerHasSnapshot = false;
          receivedEventNo = 0;
          if (!fallback) notifyStatus(false);
          publish('hello');
          return;
        }
        receivedEventNo = packet.eventNo;
        applyEvent(packet.event);
      } else if (packet.type === 'status' && packet.connected === false) {
        peerHasSnapshot = false;
        receivedEventNo = 0;
        // The direct recovery socket may remain authoritative and live.
        if (!fallback) notifyStatus(false);
      }
    };
    channel.addEventListener('message', onMessage);
    const watchdog = every(() => {
      if (closed) return;
      if (leader) {
        publish('heartbeat', { connected: entry.connected });
        return;
      }
      if (!recent(now(), lastLeaderAt, PEER_TIMEOUT_MS)) {
        activeLeader = null; peerHasSnapshot = false;
        receivedEventNo = 0;
        peerOfflineSince = 0;
        if (!fallback) { notifyStatus(false); startSource(false); }
      } else if ((!peerHasSnapshot && now() - leaderSeenAt >= FIRST_SNAPSHOT_WAIT_MS) ||
          (peerOfflineSince > 0 && now() - peerOfflineSince >= PEER_OFFLINE_WAIT_MS)) {
        // An alive renderer with no genuine snapshot, or an exchange relay
        // that remains offline despite heartbeats, is not a usable source.
        if (!fallback) {
          notifyStatus(false);
          startSource(false);
        }
      }
    }, HEARTBEAT_MS);
    entry.stop = () => {
      if (closed) return;
      if (leader) publish('bye', { connected: false });
      closed = true; abort.abort();
      stopFallback(); stopUpstream();
      releaseLock?.(); releaseLock = null;
      notifyStatus(false);
      cancelEvery(watchdog);
      channel.removeEventListener('message', onMessage);
      try { channel.close(); } catch {}
    };
    try { listener.onStatus(false); } catch {}
    publish('hello');
    void options.lock('h00k-desktop-public-liq:' + key, abort.signal, async () => {
      if (closed) return;
      leader = true; activeLeader = sender;
      publishedEventNo = 0; receivedEventNo = 0;
      stopFallback();
      notifyStatus(false);
      publish('heartbeat', { connected: false });
      startSource(true);
      try {
        await new Promise<void>(resolve => { releaseLock = resolve; });
      } finally {
        releaseLock = null; stopUpstream(); leader = false;
      }
    }).catch(() => {
      if (!closed && !leader && !fallback) startSource(false);
    });
    return () => {
      entry.listeners.delete(listener);
      if (!entry.listeners.size && subscriptions.get(key) === entry) {
        subscriptions.delete(key);
        entry.stop();
      }
    };
  };
  const close = () => {
    for (const entry of subscriptions.values()) entry.stop();
    subscriptions.clear();
  };
  return { subscribe, activeScopes: () => subscriptions.size, close };
}
