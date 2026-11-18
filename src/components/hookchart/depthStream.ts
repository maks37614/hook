import type { ExchangeId, MarketType } from '../../types';
import type { BookUpdate } from '../../utils/binanceOrderBook';
import { chartDepthScope, type ChartDepthPacket, type ChartDepthStatus } from '../../utils/hookChartDepthProtocol';
import { normalizeExchangeSymbol } from '../../utils/marketSymbols';
import { isFreshDepthTime, ORDER_BOOK_MAX_AGE_MS } from '../../utils/orderBookValidation';

type Options = {
  exchange: ExchangeId; marketType: MarketType; symbol: string;
  onBook: (update: BookUpdate) => boolean;
  onStatus: (status: ChartDepthStatus) => void;
  origin?: string;
  createSocket?: (url: string) => WebSocket;
};

/** Use the site's own origin so exchange CORS, ports and browser regions do not block depth. */
export function connectHookChartDepth({ exchange, marketType, symbol, onBook, onStatus,
  origin = window.location.origin, createSocket = url => new WebSocket(url) }: Options) {
  const cleanSymbol = normalizeExchangeSymbol(symbol);
  const scope = chartDepthScope(exchange, marketType, cleanSymbol);
  const url = new URL('/api/hookchart/depth', origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.search = new URLSearchParams({ exchange, market: marketType, symbol: cleanSymbol }).toString();
  let stopped = false, socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let retryMs = 1000, connectedAt = 0, lastMessage = 0, lastBook = 0;
  // A socket can keep sending valid status heartbeats without ever delivering
  // a usable book. Track the wait independently of lastMessage so we can
  // recover instead of leaving chart liquidity stuck on "syncing" forever.
  let waitingForBookSince = 0;
  let clockOffset: number | null = null;
  const reconnect = () => {
    if (stopped || retry) return;
    onStatus('reconnecting');
    const old = socket; socket = null;
    try { old?.close(); } catch {}
    retry = setTimeout(() => { retry = null; connect(); }, retryMs);
    retryMs = Math.min(30_000, retryMs * 2);
  };
  const connect = () => {
    if (stopped) return;
    connectedAt = lastMessage = waitingForBookSince = Date.now();
    lastBook = 0; clockOffset = null;
    onStatus('connecting');
    try {
      const current = createSocket(url.href); socket = current;
      current.onopen = () => { if (!stopped && socket === current) onStatus('syncing'); };
      current.onmessage = event => {
        if (stopped || socket !== current) return;
        try {
          const packet = JSON.parse(String(event.data)) as ChartDepthPacket;
          const now = Date.now();
          if (packet.scope !== scope || !Number.isFinite(packet.sampledAt) || packet.sampledAt <= 0 ||
              !['CONNECTING', 'SYNCING', 'LIVE', 'STALE', 'RESYNCING', 'ERROR'].includes(packet.status)) { reconnect(); return; }
          // Durations on the server clock are mapped to this browser's request start, conservatively
          // including the opening handshake. A computer clock offset must not reject every level.
          if (clockOffset === null) clockOffset = connectedAt - packet.sampledAt;
          lastMessage = now;
          if (packet.update) {
            const eventTime = (packet.update.eventTime ?? packet.sampledAt) + clockOffset;
            if (packet.status !== 'LIVE' || !isFreshDepthTime(eventTime, now) || !onBook({ ...packet.update, eventTime })) {
              reconnect(); return;
            }
            lastBook = now;
            waitingForBookSince = 0;
            retryMs = 1000;
            onStatus('live');
          } else if (packet.status !== 'LIVE') {
            // Start a *new* wait when an established book is withdrawn, but
            // never restart the deadline for repeated SYNCING/ERROR statuses.
            if (lastBook) waitingForBookSince = now;
            lastBook = 0;
            onStatus(packet.status === 'ERROR' ? 'unavailable' : ['STALE', 'RESYNCING'].includes(packet.status) ? 'reconnecting' : 'syncing');
          }
        } catch { reconnect(); }
      };
      current.onerror = () => { if (!stopped && socket === current) reconnect(); };
      current.onclose = () => { if (!stopped && socket === current) reconnect(); };
    } catch { reconnect(); }
  };
  connect();
  const watchdog = setInterval(() => {
    if (stopped) return;
    const now = Date.now();
    // Even status-only LIVE/SYNCING heartbeats cannot indefinitely postpone
    // the first usable snapshot. Preserve the normal 5s freshness check once
    // a book is live, and allow a separate 15s window after a resync starts.
    const bookTimedOut = lastBook
      ? now - lastBook > ORDER_BOOK_MAX_AGE_MS
      : waitingForBookSince > 0 && now - waitingForBookSince > 15_000;
    if (bookTimedOut || now - lastMessage > 15_000) reconnect();
  }, 1000);
  return () => {
    stopped = true;
    clearInterval(watchdog);
    if (retry) clearTimeout(retry);
    try { socket?.close(); } catch {}
    socket = null;
  };
}
