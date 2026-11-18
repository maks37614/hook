import {
  readScreenerLiveQuotePacket,
  SCREENER_LIVE_PAINT_MS,
  type ScreenerLiveQuote,
  type ScreenerLiveScope,
  screenerLiveScopeKey,
} from './screenerLiveQuotes';

/** One public site WS per visible Screener. Exchange WebSockets remain on
 * the server, so 50 rows never become 50 browser exchange connections.
 * The bounded timer batches UI updates; no localStorage or user tokens.
 */
export function createScreenerQuoteSocket(
  onRows: (rows: ScreenerLiveQuote[], at: number) => void,
  createSocket: (url: string) => WebSocket = url => new WebSocket(url),
) {
  let socket: WebSocket | null = null;
  let active = false;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;
  let scopes: ScreenerLiveScope[] = [];
  let subscribedKeys = new Set<string>();
  let lastSent = '';
  const buffered = new Map<string, ScreenerLiveQuote>();

  const sendScopes = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const encoded = JSON.stringify({ type: 'subscribe', scopes });
    if (encoded === lastSent) return;
    lastSent = encoded;
    try { socket.send(encoded); }
    catch { try { socket.close(); } catch {} }
  };
  const flush = () => {
    flushTimer = null;
    if (!active || typeof document !== 'undefined' && document.hidden || !buffered.size) {
      buffered.clear();
      return;
    }
    const rows = [...buffered.values()];
    buffered.clear();
    onRows(rows, Date.now());
  };
  const scheduleFlush = () => {
    if (flushTimer !== null) return;
    flushTimer = setTimeout(flush, SCREENER_LIVE_PAINT_MS);
  };
  const release = () => {
    const old = socket;
    socket = null;
    if (!old) return;
    old.onopen = old.onmessage = old.onclose = old.onerror = null;
    try { old.close(); } catch {}
    lastSent = '';
  };
  const connect = () => {
    if (!active || socket || typeof document !== 'undefined' && document.hidden) return;
    let next: WebSocket;
    try {
      const url = new URL('/api/screener/live-quotes', window.location.href);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      next = createSocket(url.toString());
    } catch { reconnect(); return; }
    socket = next;
    next.onopen = () => {
      if (socket !== next) return;
      attempts = 0;
      lastSent = '';
      sendScopes();
    };
    next.onmessage = event => {
      if (socket !== next) return;
      let packet: any;
      try { packet = JSON.parse(String(event.data)); } catch { return; }
      const rows = readScreenerLiveQuotePacket(packet);
      for (const row of rows) {
        const key = screenerLiveScopeKey(row);
        if (subscribedKeys.has(key)) buffered.set(key, row);
      }
      if (buffered.size) scheduleFlush();
    };
    next.onerror = () => { if (socket === next) try { next.close(); } catch {} };
    next.onclose = () => { if (socket !== next) return; release(); reconnect(); };
  };
  const reconnect = () => {
    if (!active || retry !== null ||
        typeof document !== 'undefined' && document.hidden) return;
    const delay = Math.min(20_000, 1000 * (2 ** Math.min(5, attempts++)));
    retry = setTimeout(() => { retry = null; connect(); }, delay + Math.floor(Math.random() * 400));
  };
  const onVisibility = () => {
    if (!active) return;
    if (document.hidden) {
      if (retry) clearTimeout(retry);
      retry = null;
      release();
      buffered.clear();
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = null;
    } else connect();
  };
  return {
    start() {
      if (active) return;
      active = true;
      document.addEventListener('visibilitychange', onVisibility);
      connect();
    },
    updateScopes(next: ScreenerLiveScope[]) {
      const sorted = [...next].sort((a, b) =>
        screenerLiveScopeKey(a).localeCompare(screenerLiveScopeKey(b)));
      if (JSON.stringify(sorted) === JSON.stringify(scopes)) return;
      scopes = sorted;
      subscribedKeys = new Set(scopes.map(screenerLiveScopeKey));
      // A packet queued before a filter/exchange change must not repaint a
      // row whose market is no longer being watched.
      for (const key of buffered.keys()) {
        if (!subscribedKeys.has(key)) buffered.delete(key);
      }
      sendScopes();
    },
    stop() {
      active = false;
      document.removeEventListener('visibilitychange', onVisibility);
      if (retry) clearTimeout(retry);
      if (flushTimer) clearTimeout(flushTimer);
      retry = null;
      flushTimer = null;
      buffered.clear();
      release();
    },
  };
}
