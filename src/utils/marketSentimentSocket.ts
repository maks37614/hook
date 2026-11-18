import type { MarketSentimentData } from '../types';

export type MarketSentimentPacket = { data: MarketSentimentData; at: number };

/** Validate the whole UI-facing shape before accepting a public WS message.
 * Unavailable data never become fabricated zeros or replace the last result.
 */
export function readMarketSentimentPacket(raw: unknown, now = Date.now()): MarketSentimentPacket | null {
  if (!raw || typeof raw !== 'object') return null;
  const packet = raw as { type?: unknown; at?: unknown; data?: unknown };
  if (packet.type !== 'sentiment' || !Number.isSafeInteger(packet.at) ||
      (packet.at as number) > now + 2_000 || now - (packet.at as number) > 90_000 ||
      !packet.data || typeof packet.data !== 'object') return null;
  const data = packet.data as MarketSentimentData;
  const finite = (number: unknown): number is number =>
    typeof number === 'number' && Number.isFinite(number);
  if (!finite(data.compositeScore) || data.compositeScore < 0 || data.compositeScore > 100 ||
      !['extreme_fear', 'fear', 'neutral', 'greed', 'extreme_greed'].includes(data.sentimentState) ||
      typeof data.sentimentLabel !== 'string' || typeof data.summary !== 'string' ||
      !data.priceTrendDynamics || !data.tradingVolume || !data.marketVolatility ||
      !data.marketBreadth || !data.capitalFlow || !data.derivativesOverview || !data.dataQuality ||
      !finite(data.priceTrendDynamics.advancingCount) ||
      !finite(data.priceTrendDynamics.decliningCount) ||
      !finite(data.priceTrendDynamics.advancingPct) ||
      !finite(data.tradingVolume.total24hUsd) ||
      !finite(data.marketVolatility.avgDailyRangePct) ||
      !finite(data.marketVolatility.index) ||
      !finite(data.marketBreadth.breadthScore) ||
      !finite(data.dataQuality.locationCoveragePct) ||
      !finite(data.lastUpdated)) return null;
  return { data, at: packet.at as number };
}

/** One same-origin browser connection while visible, with bounded reconnects.
 * Exchange sockets remain shared on the server. Caller owns REST failover.
 */
export function createMarketSentimentSocket(
  onData: (packet: MarketSentimentPacket) => void,
  onStatus: (healthy: boolean) => void,
  onUnavailable?: () => void,
  createSocket: (url: string) => WebSocket = url => new WebSocket(url),
) {
  let active = false;
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;
  let lastPacketAt = 0;

  const release = () => {
    const old = socket;
    socket = null;
    if (!old) return;
    old.onopen = old.onmessage = old.onclose = old.onerror = null;
    try { old.close(); } catch { /* disconnected */ }
    onStatus(false);
  };
  const reconnect = () => {
    if (!active || retry !== null || document.visibilityState === 'hidden') return;
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(5, attempts++));
    retry = setTimeout(() => { retry = null; connect(); }, delay + Math.floor(Math.random() * 500));
  };
  const connect = () => {
    if (!active || socket || document.visibilityState === 'hidden') return;
    // A reconnect may legitimately receive the last cached packet again.
    lastPacketAt = 0;
    let next: WebSocket;
    try {
      const url = new URL('/api/market/sentiment/live', window.location.href);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      next = createSocket(url.toString());
    } catch { reconnect(); return; }
    socket = next;
    // A successful upgrade alone is not a healthy feed (it may close at capacity).
    // Reset backoff only after receiving a validated sentiment snapshot.
    next.onopen = () => {};
    next.onmessage = event => {
      if (socket !== next || document.visibilityState === 'hidden') return;
      let message: unknown;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      const packet = readMarketSentimentPacket(message);
      if (packet) {
        if (packet.at <= lastPacketAt) return;
        lastPacketAt = packet.at;
        attempts = 0;
        onStatus(true);
        onData(packet);
      } else if (message && typeof message === 'object' &&
          (message as { type?: unknown }).type === 'unavailable') {
        onUnavailable?.();
      }
    };
    next.onerror = () => { if (socket === next) try { next.close(); } catch {} };
    next.onclose = () => {
      if (socket !== next) return;
      release();
      reconnect();
    };
  };
  const onVisibility = () => {
    if (!active) return;
    if (document.visibilityState === 'hidden') {
      if (retry !== null) clearTimeout(retry);
      retry = null;
      release();
    } else {
      // The server may resend an identical cached packet on a fresh socket.
      lastPacketAt = 0;
      connect();
    }
  };
  return {
    start() {
      if (active) return;
      active = true;
      document.addEventListener('visibilitychange', onVisibility);
      connect();
    },
    stop() {
      active = false;
      document.removeEventListener('visibilitychange', onVisibility);
      if (retry !== null) clearTimeout(retry);
      retry = null;
      release();
    },
  };
}
