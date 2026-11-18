import { parseBinanceAggregateTrade } from './binanceTradeGapRecovery';
import type { BinanceTradePacket, BinanceTradeScope, SharedTradeSocket } from './binanceSharedTradeTransport';

const URLS = {
  futures: 'wss://fstream.binance.com/market/ws',
  spot: 'wss://stream.binance.com:9443/ws',
} as const;

/** Binance-only public aggTrade WebSocket; maintains its own reconnect budget.
 * The owner tab and any disconnected followers use identical live decoding.
 */
export function openSharedBinanceTradeSocket(
  scope: BinanceTradeScope,
  onTrade: (trade: BinanceTradePacket) => void,
  onConnected: (connected: boolean) => void,
): SharedTradeSocket {
  let closed = false;
  let ws: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let deadline: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;
  const clean = () => {
    if (deadline !== null) clearTimeout(deadline);
    deadline = null;
    const previous = ws;
    ws = null;
    if (previous) {
      previous.onopen = previous.onmessage = previous.onerror = previous.onclose = null;
      try { previous.close(); } catch { /* already closed */ }
    }
  };
  const reconnect = () => {
    if (closed || retry !== null) return;
    clean();
    try { onConnected(false); } catch { /* consumer already gone */ }
    const base = Math.min(20_000, 1_000 * 2 ** Math.min(attempts++, 4));
    retry = setTimeout(() => { retry = null; connect(); }, base + Math.floor(Math.random() * 800));
  };
  function connect() {
    if (closed) return;
    try {
      const socket = new WebSocket(URLS[scope.marketType] + '/' +
        encodeURIComponent(scope.symbol.toLowerCase()) + '@aggTrade');
      ws = socket;
      let openedAt = 0;
      socket.onopen = () => {
        if (closed || ws !== socket) return;
        openedAt = Date.now();
        if (deadline !== null) clearTimeout(deadline);
        deadline = null;
        try { onConnected(true); } catch { /* isolated from socket */ }
      };
      socket.onmessage = (event: MessageEvent) => {
        if (closed || ws !== socket) return;
        try {
          const payload = JSON.parse(String(event.data));
          const data = payload?.data ?? payload;
          if (data?.e !== 'aggTrade' ||
              String(data.s || '').toUpperCase() !== scope.symbol.toUpperCase()) return;
          const trade = parseBinanceAggregateTrade(data);
          if (trade) onTrade(trade);
        } catch { /* reject malformed public exchange frames */ }
      };
      socket.onerror = reconnect;
      socket.onclose = () => {
        if (openedAt > 0 && Date.now() - openedAt >= 30_000) attempts = 0;
        reconnect();
      };
      deadline = setTimeout(() => {
        if (!closed && ws === socket && !openedAt) reconnect();
      }, 15_000);
    } catch { reconnect(); }
  }
  connect();
  return { close() {
    if (closed) return;
    closed = true;
    if (retry !== null) clearTimeout(retry);
    retry = null;
    clean();
  } };
}
