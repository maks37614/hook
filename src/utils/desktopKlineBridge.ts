import type { ExchangeId, MarketType } from '../types';
import { validCandle } from './hookchartData';
import { isValidExchangeSymbol, normalizeExchangeSymbol } from './marketSymbols';
import type { LiveKline } from '../components/hookchart/sharedKlineStream';

// Public candles only: never relay account data, tokens, alerts, private API
// responses, trading commands or credentials between renderer processes.
export type DesktopKlineScope = {
  exchange: ExchangeId; marketType: MarketType; symbol: string; timeframe: string;
};
export type DesktopKlineListener = {
  onCandle: (candle: LiveKline) => void;
  onStatus?: (connected: boolean) => void;
};
export interface DesktopKlineChannel {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', callback: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: 'message', callback: (event: MessageEvent<unknown>) => void): void;
  close(): void;
}
export type DesktopKlineLock = (
  name: string, signal: AbortSignal, task: () => Promise<void>,
) => Promise<void>;

type Source = (scope: DesktopKlineScope, listener: DesktopKlineListener) => () => void;
type Packet = {
  type: 'hello' | 'heartbeat' | 'status' | 'candle' | 'bye';
  scope: string; sender: string; sentAt: number;
  connected?: boolean; candle?: LiveKline;
};

// A frozen / disconnected leader must never leave charts indefinitely LIVE.
export const DESKTOP_KLINE_PEER_TIMEOUT_MS = 7_000;
export const DESKTOP_KLINE_CANDLE_FRESH_MS = 20_000;
export const DESKTOP_KLINE_FIRST_CANDLE_WAIT_MS = 20_000;
const HEARTBEAT_MS = 2_000;
const MAX_SCOPE_LENGTH = 110;
const MAX_SCOPES = 100;

function scopeKey(scope: DesktopKlineScope): string {
  return [scope.exchange, scope.marketType, scope.symbol.toUpperCase(), scope.timeframe].join(':');
}
function isRecent(now: number, time: number, maxAge: number): boolean {
  return Number.isFinite(time) && time <= now + 2_000 && time >= now - maxAge;
}
function isNewer(candle: LiveKline, previous: LiveKline | null): boolean {
  if (!previous) return true;
  if (candle.time < previous.time) return false;
  if (candle.time > previous.time) return true;
  return (candle.eventTime ?? 0) >= (previous.eventTime ?? 0) &&
    candle.volume >= previous.volume;
}

export function createDesktopKlineBridge(options: {
  createChannel: (name: string) => DesktopKlineChannel;
  lock: DesktopKlineLock;
  source: Source;
  now?: () => number;
  every?: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  cancelEvery?: (timer: ReturnType<typeof setInterval>) => void;
}) {
  const now = options.now || Date.now;
  const every = options.every || ((fn, ms) => setInterval(fn, ms));
  const cancelEvery = options.cancelEvery || clearInterval;
  const subscriptions = new Map<string, {
    listeners: Set<DesktopKlineListener>;
    close: () => void;
    connected: boolean;
    last: LiveKline | null;
    lastReceivedAt: number;
  }>();
  const sender = 'renderer-' + Math.random().toString(36).slice(2) + '-' + now().toString(36);

  const subscribe = (scope: DesktopKlineScope, listener: DesktopKlineListener): (() => void) => {
    const key = scopeKey(scope);
    // Invalid scopes still reach the underlying validator and its normal
    // disconnected status, rather than creating arbitrary channel names.
    // Match the same Unicode market-symbol validation as HookChart itself.
    // Binance lists instruments such as 龙虾USDT; an ASCII-only scope rule
    // silently opened separate sockets for each Desktop pane displaying them.
    const normalizedSymbol = normalizeExchangeSymbol(scope.symbol);
    if (!['binance', 'bybit'].includes(scope.exchange) ||
      !['futures', 'spot'].includes(scope.marketType) ||
      !['1m', '5m', '15m', '1h', '4h', '1d'].includes(scope.timeframe) ||
      !isValidExchangeSymbol(normalizedSymbol) ||
      normalizedSymbol !== scope.symbol.toUpperCase() ||
      key.length > MAX_SCOPE_LENGTH || (subscriptions.size >= MAX_SCOPES && !subscriptions.has(key))) {
      return options.source(scope, listener);
    }
    const existing = subscriptions.get(key);
    if (existing) {
      existing.listeners.add(listener);
      try { listener.onStatus?.(existing.connected); } catch {}
      if (existing.last && isRecent(now(), existing.lastReceivedAt, DESKTOP_KLINE_CANDLE_FRESH_MS)) {
        try { listener.onCandle(existing.last); } catch {}
      }
      return () => {
        existing.listeners.delete(listener);
        if (!existing.listeners.size && subscriptions.get(key) === existing) {
          subscriptions.delete(key);
          existing.close();
        }
      };
    }

    let channel: DesktopKlineChannel;
    try { channel = options.createChannel('h00k-desktop-public-kline-v1:' + key); }
    catch { return options.source(scope, listener); }
    const listeners = new Set<DesktopKlineListener>([listener]);
    let closed = false;
    let leader = false;
    let activeLeader: string | null = null;
    let lastLeaderAt = 0;
    let leaderFirstSeenAt = now();
    let upstream: (() => void) | null = null;
    let fallback: (() => void) | null = null;
    let releaseLeader: (() => void) | null = null;
    const abort = new AbortController();

    const current = {
      listeners, connected: false, last: null as LiveKline | null, lastReceivedAt: 0,
      close: () => {},
    };
    subscriptions.set(key, current);
    const status = (connected: boolean) => {
      if (current.connected === connected) return;
      current.connected = connected;
      for (const sub of [...listeners]) {
        try { sub.onStatus?.(connected); } catch {}
      }
    };
    const acceptCandle = (candle: LiveKline, receivedAt: number) => {
      if (!Number.isSafeInteger(candle.time) || !validCandle(candle) ||
        !isNewer(candle, current.last)) return false;
      current.last = candle;
      current.lastReceivedAt = receivedAt;
      status(true);
      for (const sub of [...listeners]) {
        try { sub.onCandle(candle); } catch {}
      }
      return true;
    };
    const publish = (type: Packet['type'], extra: Partial<Packet> = {}) => {
      if (closed) return;
      try { channel.postMessage({ type, scope: key, sender, sentAt: now(), ...extra } satisfies Packet); }
      catch { /* Native transport remains the fallback; never throw in chart renderers. */ }
    };
    const stopFallback = () => {
      const dispose = fallback; fallback = null;
      try { dispose?.(); } catch {}
    };
    const stopUpstream = () => {
      const dispose = upstream; upstream = null;
      try { dispose?.(); } catch {}
    };
    const startSource = (isLeader: boolean) => {
      const handle: DesktopKlineListener = {
        onCandle: candle => {
          if (closed || leader !== isLeader) return;
          if (acceptCandle(candle, now()) && isLeader) publish('candle', { candle });
        },
        onStatus: connected => {
          if (closed || leader !== isLeader) return;
          if (!connected) status(false);
          if (isLeader) publish('status', { connected });
        },
      };
      try {
        const stop = options.source(scope, handle);
        if (closed) { stop(); return; }
        if (isLeader) upstream = stop; else fallback = stop;
      } catch {
        status(false);
      }
    };
    const onMessage = (event: MessageEvent<unknown>) => {
      const msg = event.data as Partial<Packet> | null;
      if (closed || !msg || typeof msg !== 'object' || msg.scope !== key ||
        msg.sender === sender || typeof msg.sender !== 'string' ||
        msg.sender.length > 90 || !isRecent(now(), msg.sentAt ?? NaN, 5_000)) return;
      if (msg.type === 'hello') {
        if (leader) {
          publish('heartbeat', { connected: current.connected });
          if (current.last && isRecent(now(), current.lastReceivedAt, DESKTOP_KLINE_CANDLE_FRESH_MS)) {
            publish('candle', { candle: current.last });
          }
        }
        return;
      }
      if (leader) return;
      if (msg.type === 'bye') {
        // A cleanly closed owner immediately releases the logical lease.
        // Don't discard seven seconds of valid candles from its successor.
        if (activeLeader === msg.sender) {
          activeLeader = null;
          lastLeaderAt = 0;
          status(false);
        }
        return;
      }
      if (!['heartbeat', 'status', 'candle'].includes(msg.type || '')) return;
      if (activeLeader && msg.sender !== activeLeader &&
        isRecent(now(), lastLeaderAt, DESKTOP_KLINE_PEER_TIMEOUT_MS)) return;
      if (activeLeader !== msg.sender) {
        activeLeader = msg.sender;
        leaderFirstSeenAt = now();
        // Retain the newest verified candle, especially when our local
        // emergency fallback has progressed beyond the newly elected owner.
        // Clearing it here would allow stale snapshots to move prices back.
        status(false);
      }
      lastLeaderAt = now();
      if (msg.type === 'candle' && msg.candle &&
        // Only live values from this scope, never arbitrary data or stale
        // snapshots from a dead renderer. Exchange event timestamps are
        // milliseconds, not candle opening times in seconds.
        Number.isSafeInteger(msg.candle.time) && validCandle(msg.candle) &&
        (msg.candle.eventTime === undefined ||
          isRecent(now(), msg.candle.eventTime, 30_000))) {
        // A stale owner replay must not tear down a newer local fallback.
        if (acceptCandle(msg.candle, now()) && fallback) stopFallback();
      } else if (msg.connected === false && !fallback) {
        status(false);
      }
    };
    channel.addEventListener('message', onMessage);

    // Followers do not own a second WebSocket. If Web Locks stop progressing
    // or a renderer freezes, fail open with a normal independent live socket
    // until the shared leader's fresh candles return.
    const watchdog = every(() => {
      if (closed) return;
      if (leader) {
        // Quiet markets can legitimately have no candle trades for seconds.
        // The Web Lock owner must still announce liveness so follower panes
        // do not open duplicate VPS WebSockets after the 7s peer timeout.
        publish('heartbeat', { connected: current.connected });
        return;
      }
      if (!isRecent(now(), lastLeaderAt, DESKTOP_KLINE_PEER_TIMEOUT_MS)) {
        activeLeader = null;
        status(false);
        if (!fallback) startSource(false);
      } else if ((!current.last &&
          now() - leaderFirstSeenAt >= DESKTOP_KLINE_FIRST_CANDLE_WAIT_MS) ||
          (current.last &&
            !isRecent(now(), current.lastReceivedAt, DESKTOP_KLINE_CANDLE_FRESH_MS))) {
        // Heartbeats certify that a renderer lives, not that the exchange
        // supplies candles. Still fail open if its upstream stays silent, and
        // recover automatically when a newer public peer candle arrives.
        status(false);
        if (!fallback) startSource(false);
      }
    }, HEARTBEAT_MS);

    current.close = () => {
      if (closed) return;
      if (leader) publish('bye', { connected: false });
      closed = true;
      abort.abort();
      stopFallback();
      stopUpstream();
      releaseLeader?.();
      releaseLeader = null;
      status(false);
      cancelEvery(watchdog);
      channel.removeEventListener('message', onMessage);
      try { channel.close(); } catch {}
    };
    try { listener.onStatus?.(false); } catch {}
    publish('hello');
    // One Web Lock (not a localStorage lease) gives exclusive ownership of
    // the upstream WS across all Desktop windows on the same Chromium origin.
    void options.lock('h00k-desktop-public-kline:' + key, abort.signal, async () => {
      if (closed) return;
      leader = true;
      activeLeader = sender;
      stopFallback();
      // Do not reset the monotonic candle watermark when this pane wins the
      // Web Lock. A local fail-open socket may have received a newer candle
      // just before ownership handover; older relay snapshots must not win.
      status(false);
      publish('heartbeat', { connected: false });
      startSource(true);
      try {
        await new Promise<void>(resolve => { releaseLeader = resolve; });
      } finally {
        releaseLeader = null;
        stopUpstream();
        leader = false;
      }
    }).catch(() => {
      if (!closed && !fallback && !leader) startSource(false);
    });

    return () => {
      listeners.delete(listener);
      if (!listeners.size && subscriptions.get(key) === current) {
        subscriptions.delete(key);
        current.close();
      }
    };
  };
  const close = () => {
    for (const value of subscriptions.values()) value.close();
    subscriptions.clear();
  };
  return { subscribe, activeScopes: () => subscriptions.size, close };
}
