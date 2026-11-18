import type { ExchangeId, Kline, MarketType } from '../../types';
import { isValidExchangeSymbol, normalizeExchangeSymbol } from '../../utils/marketSymbols';
import { isOlderLiveCandle, sameKlineValues, validCandle } from '../../utils/hookchartData';
import { recordChartKline, recordChartReconnect, recordChartTransportError } from './chartDiagnostics';
import { createDesktopKlineBridge } from '../../utils/desktopKlineBridge';

export type LiveKline = Kline & { eventTime?: number; closed?: true };
type Scope = { exchange: ExchangeId; marketType: MarketType; symbol: string; timeframe: string };
type Listener = { onCandle: (candle: LiveKline) => void; onStatus?: (connected: boolean) => void };
type SocketFactory = (url: string) => WebSocket;

const BINANCE_WS: Record<MarketType, string> = {
  futures: 'wss://fstream.binance.com/market/ws',
  spot: 'wss://stream.binance.com:9443/ws',
};
const BYBIT_WS: Record<MarketType, string> = {
  futures: 'wss://stream.bybit.com/v5/public/linear',
  spot: 'wss://stream.bybit.com/v5/public/spot',
};
const BINANCE_INTERVAL: Record<string, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d',
};
const BYBIT_INTERVAL: Record<string, string> = {
  '1m': '1', '5m': '5', '15m': '15', '1h': '60', '4h': '240', '1d': 'D',
};

function optionalNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

export function isFreshStreamKline(candle: LiveKline, previous: LiveKline | null): boolean {
  if (!previous || candle.time > previous.time) return true;
  if (isOlderLiveCandle(candle, previous)) return false;
  const eventAt = candle.eventTime ?? 0;
  const previousEventAt = previous.eventTime ?? 0;
  const newlyClosed = candle.closed === true && previous.closed !== true;
  return eventAt > previousEventAt ||
    (eventAt === previousEventAt && (newlyClosed || !sameKlineValues(candle, previous)));
}

export function parseSharedKlineMessage(exchange: ExchangeId, payload: any, symbol: string, timeframe: string): LiveKline | null {
  let source: LiveKline;
  if (exchange === 'binance') {
    const envelope = payload?.data ?? payload;
    if (envelope?.e !== 'kline' || !envelope.k) return null;
    if (String(envelope.s || envelope.k.s || '').toUpperCase() !== symbol.toUpperCase()) return null;
    if (envelope.k.i !== BINANCE_INTERVAL[timeframe]) return null;
    const row = envelope.k;
    source = {
      time: Number(row.t) / 1000, open: Number(row.o), high: Number(row.h),
      low: Number(row.l), close: Number(row.c), volume: Number(row.v),
      tradeCount: optionalNumber(row.n),
      buyVolume: optionalNumber(row.V),
      quoteVolume: optionalNumber(row.q),
      buyQuoteVolume: optionalNumber(row.Q),
      eventTime: Number(envelope.E) || Date.now(),
      ...(row.x === true ? { closed: true } : {}),
    };
  } else {
    if (payload?.topic !== 'kline.' + BYBIT_INTERVAL[timeframe] + '.' + symbol) return null;
    const row = Array.isArray(payload.data) ? payload.data[0] : payload.data;
    if (!row) return null;
    source = {
      time: Number(row.start) / 1000, open: Number(row.open),
      high: Number(row.high), low: Number(row.low),
      close: Number(row.close), volume: Number(row.volume),
      eventTime: Number(payload.ts) || Date.now(),
      ...(row.confirm === true ? { closed: true } : {}),
    };
  }
  if (!Number.isSafeInteger(source.time) || !validCandle(source)) return null;
  return source;
}

/** One kline WebSocket per exchange/market/symbol/timeframe in this browser tab. */
export function createSharedKlineSubscriptions(socketFactory: SocketFactory = url => new WebSocket(url)) {
  type Entry = {
    listeners: Set<Listener>; socket: WebSocket | null; closed: boolean;
    ping: ReturnType<typeof setInterval> | null; retry: ReturnType<typeof setTimeout> | null;
    failures: number; connected: boolean; last: LiveKline | null; stop: () => void;
    relayFallback: boolean;
  };
  const entries = new Map<string, Entry>();
  const subscribe = (scope: Scope, listener: Listener): (() => void) => {
    const symbol = normalizeExchangeSymbol(scope.symbol);
    if (!isValidExchangeSymbol(symbol) || !BINANCE_INTERVAL[scope.timeframe] ||
        !['binance', 'bybit'].includes(scope.exchange) ||
        !['futures', 'spot'].includes(scope.marketType)) {
      try { listener.onStatus?.(false); } catch { /* isolate a broken chart */ }
      return () => {};
    }
    const key = [scope.exchange, scope.marketType, symbol, scope.timeframe].join(':');
    let entry = entries.get(key);
    if (entry) {
      const shared = entry;
      shared.listeners.add(listener);
      // Initial state and cached-candle delivery must be as isolated as
      // subsequent broadcasts. A broken chart must not leak its subscriber
      // or prevent other panels from receiving live updates.
      try { listener.onStatus?.(shared.connected); } catch { /* isolate chart */ }
      if (shared.last) {
        try { listener.onCandle(shared.last); } catch { /* isolate chart */ }
      }
      return () => {
        shared.listeners.delete(listener);
        if (!shared.listeners.size && entries.get(key) === shared) {
          entries.delete(key);
          shared.stop();
        }
      };
    }

    const shared: Entry = {
      listeners: new Set([listener]), socket: null, closed: false, ping: null,
      retry: null, failures: 0, connected: false, last: null, stop: () => {},
      relayFallback: false,
    };
    entries.set(key, shared);
    const status = (connected: boolean) => {
      if (shared.connected === connected) return;
      shared.connected = connected;
      for (const sub of [...shared.listeners]) {
        try { sub.onStatus?.(connected); } catch {}
      }
    };
    const clearPing = () => {
      if (shared.ping !== null) clearInterval(shared.ping);
      shared.ping = null;
    };
    const reconnect = () => {
      clearPing();
      if (shared.closed || shared.retry !== null) return;
      recordChartReconnect();
      status(false);
      // Jitter prevents hundreds of users reconnecting on the exact same millisecond.
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(5, shared.failures++));
      shared.retry = setTimeout(() => {
        shared.retry = null;
        connect();
      }, delay + Math.floor(Math.random() * Math.min(1000, delay)));
    };
    const connect = () => {
      if (shared.closed) return;
      let ws: WebSocket;
      // Cross-user relay is preferred on the site origin; direct exchange WS
      // remains a fail-open fallback if the VPS is full or cannot connect.
      const useRelay = !shared.relayFallback &&
        typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol);
      let startupWatch: ReturnType<typeof setTimeout> | null = null;
      // Cache is scoped to the market, but relay startup health is scoped to
      // each WebSocket. An old cached candle must not mask a dead reconnect.
      let acceptedOnThisSocket = false;
      try {
        let url: string;
        if (useRelay) {
          const destination = new URL('/api/hookchart/klines', window.location.href);
          destination.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          destination.searchParams.set('exchange', scope.exchange);
          destination.searchParams.set('market', scope.marketType);
          destination.searchParams.set('symbol', symbol);
          destination.searchParams.set('timeframe', scope.timeframe);
          url = destination.toString();
        } else {
          url = scope.exchange === 'binance'
            ? BINANCE_WS[scope.marketType] + '/' + encodeURIComponent(symbol.toLowerCase()) +
              '@kline_' + BINANCE_INTERVAL[scope.timeframe]
            : BYBIT_WS[scope.marketType];
        }
        ws = socketFactory(url);
      } catch {
        if (useRelay) shared.relayFallback = true;
        reconnect();
        return;
      }
      shared.socket = ws;
      if (useRelay) startupWatch = setTimeout(() => {
        if (!shared.closed && shared.socket === ws && !acceptedOnThisSocket) {
          shared.relayFallback = true;
          try { ws.close(); } catch {}
        }
      }, 10_000);
      ws.onopen = () => {
        if (shared.closed || shared.socket !== ws) return;
        // A socket that opens and immediately dies has not recovered; keep
        // the exponential backoff until it delivers a valid Kline.
        if (!useRelay && scope.exchange === 'bybit') {
          try {
            ws.send(JSON.stringify({ op: 'subscribe',
              args: ['kline.' + BYBIT_INTERVAL[scope.timeframe] + '.' + symbol] }));
          } catch { ws.close(); return; }
          shared.ping = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              try { ws.send(JSON.stringify({ op: 'ping' })); } catch { ws.close(); }
            }
          }, 20_000);
        }
        if (!useRelay) status(true);
      };
      ws.onmessage = event => {
        if (shared.closed || shared.socket !== ws) return;
        try {
          const packet = JSON.parse(String(event.data));
          if (useRelay && packet?.type === 'status') {
            if (!packet.connected) {
              status(false);
              // Let the shared VPS upstream reconnect first. Otherwise one
              // exchange hiccup would open hundreds of direct exchange sockets
              // at once. REST fallback remains active while the relay recovers.
              if (startupWatch === null) startupWatch = setTimeout(() => {
                if (shared.closed || shared.socket !== ws) return;
                shared.relayFallback = true;
                try { ws.close(); } catch {}
              }, 10_000 + Math.floor(Math.random() * 2000));
            }
            return;
          }
          const candle: LiveKline | null = useRelay
            ? packet?.type === 'kline' && validCandle(packet.candle) &&
                Number.isSafeInteger(packet.candle.time) ? packet.candle : null
            : parseSharedKlineMessage(scope.exchange, packet, symbol, scope.timeframe);
          if (!candle || !isFreshStreamKline(candle, shared.last)) return;
          // Neither stale relayed snapshots nor out-of-order exchange frames
          // count as proof that a newly opened socket is supplying live data.
          acceptedOnThisSocket = true;
          shared.failures = 0;
          if (startupWatch !== null) { clearTimeout(startupWatch); startupWatch = null; }
          if (useRelay) status(true);
          recordChartKline(useRelay ? 'relay' : 'exchange', Number(candle.eventTime));
          shared.last = candle;
          for (const sub of [...shared.listeners]) {
            try { sub.onCandle(candle); } catch {}
          }
        } catch {}
      };
      ws.onerror = () => { if (!shared.closed && shared.socket === ws) { recordChartTransportError(); try { ws.close(); } catch {} } };
      ws.onclose = (event) => {
        if (startupWatch !== null) clearTimeout(startupWatch);
        if (shared.socket === ws) {
          // A healthy relay may restart or briefly lose its upstream. Retry
          // the shared VPS first, rather than fan out hundreds of browser
          // sockets to the exchanges after every transient network closure.
          // If startup repeatedly fails (or the relay is at capacity),
          // use direct market WS as the bounded fail-open path.
          if (useRelay && !acceptedOnThisSocket &&
              (shared.failures >= 1 || event.code === 1013)) {
            shared.relayFallback = true;
          }
          reconnect();
        }
      };
    };
    shared.stop = () => {
      shared.closed = true;
      if (shared.retry !== null) clearTimeout(shared.retry);
      shared.retry = null;
      clearPing();
      status(false);
      shared.socket?.close();
      shared.socket = null;
    };
    try { listener.onStatus?.(false); } catch { /* isolate chart */ }
    connect();
    return () => {
      shared.listeners.delete(listener);
      if (!shared.listeners.size && entries.get(key) === shared) {
        entries.delete(key);
        shared.stop();
      }
    };
  };
  return { subscribe, activeScopes: () => entries.size };
}

const browserKlineSubscriptions = createSharedKlineSubscriptions();
let desktopBridge: ReturnType<typeof createDesktopKlineBridge> | null = null;

/** One upstream for the same PUBLIC candle stream across same-origin browser
 * tabs or h00k Desktop windows, when Web Locks and BroadcastChannel exist.
 * User accounts, drawing state, orders and alerts never enter the channel.
 * Unsupported browsers/symbols fall back to the existing tab-local stream.
 */
export function subscribeSharedKlines(scope: Scope, listener: Listener): () => void {
  const sameOriginWindow = typeof window !== 'undefined' &&
    /^https?:$/.test(window.location.protocol);
  if (!sameOriginWindow || typeof BroadcastChannel === 'undefined' ||
    typeof navigator === 'undefined' || !navigator.locks?.request) {
    return browserKlineSubscriptions.subscribe(scope, listener);
  }
  try {
    desktopBridge ||= createDesktopKlineBridge({
      createChannel: name => new BroadcastChannel(name),
      lock: async (name, signal, task) =>
        await navigator.locks.request(name, { mode: 'exclusive', signal }, task),
      source: browserKlineSubscriptions.subscribe,
    });
    return desktopBridge.subscribe(scope, listener);
  } catch {
    // A blocked Chromium feature must never take away live chart data.
    return browserKlineSubscriptions.subscribe(scope, listener);
  }
}
