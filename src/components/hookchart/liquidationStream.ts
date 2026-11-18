import type { ExchangeId } from '../../types';
import type { Liquidation } from './engine';
import { multiplexBrowserLiquidations } from './liquidationMultiplexClient';

type Options = {
  exchange: ExchangeId;
  symbol: string;
  onSnapshot: (events: Liquidation[], connected: boolean) => void;
  onLiquidation: (event: Liquidation) => void;
  onStatus: (connected: boolean) => void;
};

function validLiquidation(row: unknown): row is Liquidation {
  if (!row || typeof row !== 'object') return false;
  const item = row as Record<string, unknown>;
  return typeof item.id === 'string' && item.id.length < 180 &&
    (item.side === 'LONG' || item.side === 'SHORT') &&
    typeof item.t === 'number' && Number.isSafeInteger(item.t) &&
    typeof item.p === 'number' && Number.isFinite(item.p) && item.p > 0 &&
    typeof item.q === 'number' && Number.isFinite(item.q) && item.q > 0 &&
    typeof item.usd === 'number' && Number.isFinite(item.usd) && item.usd > 0;
}

/** The first snapshot is sent immediately by the site's liquidation relay. */
const INITIAL_SNAPSHOT_TIMEOUT_MS = 15_000;
const STABLE_SNAPSHOT_CONNECTION_MS = 30_000;

/**
 * One browser-to-site liquidation socket per scope (shared across HookCharts).
 * Do not time out a healthy, quiet market after its first snapshot: actual
 * liquidations can be arbitrarily rare. Only the initial synchronization and
 * explicit socket failures trigger recovery.
 */
export function connectHookChartLiquidations({
  exchange, symbol, onSnapshot, onLiquidation, onStatus,
}: Options): () => void {
  // Build-time rollout flag. The legacy transport remains available with
  // VITE_LIQ_CLIENT_MULTIPLEX=0 if a deployment needs immediate rollback.
  // Multi mode shares ONE site WebSocket across different coin charts per tab.
  if (import.meta.env?.VITE_LIQ_CLIENT_MULTIPLEX === '1') {
    return multiplexBrowserLiquidations.subscribe({
      exchange, symbol, onSnapshot, onLiquidation, onStatus,
    });
  }
  let stopped = false;
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let snapshotDeadline: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;

  const url = new URL('/api/hookchart/liquidations', window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('exchange', exchange);
  url.searchParams.set('symbol', symbol);

  // UI handlers may be disposed or throw during navigation. They must never
  // prevent the transport from returning a disposer or scheduling a retry.
  const reportStatus = (connected: boolean) => {
    try { onStatus(connected); } catch { /* isolate the chart */ }
  };
  const clearSnapshotDeadline = () => {
    if (snapshotDeadline !== null) clearTimeout(snapshotDeadline);
    snapshotDeadline = null;
  };
  const schedule = () => {
    if (stopped || retry) return;
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(failures++, 5));
    retry = setTimeout(() => {
      retry = null;
      connect();
    }, delay);
  };

  const connect = () => {
    if (stopped) return;
    let current: WebSocket;
    try { current = new WebSocket(url.toString()); }
    catch { schedule(); return; }
    socket = current;
    let hasSnapshot = false;
    let snapshotAt = 0;

    const reconnect = () => {
      // Close/error/timeout can all race. Only the current socket may affect
      // shared timers; an obsolete socket cannot interrupt its replacement.
      if (stopped || socket !== current || retry) return;
      socket = null;
      clearSnapshotDeadline();
      // An immediate open/snapshot/close loop is not healthy. Preserve the
      // exponential retry budget until a socket is genuinely stable.
      if (hasSnapshot && Date.now() - snapshotAt >= STABLE_SNAPSHOT_CONNECTION_MS) failures = 0;
      reportStatus(false);
      schedule();
      try { current.close(); } catch {}
    };

    current.onmessage = event => {
      if (stopped || socket !== current || retry) return;
      let packet: Record<string, unknown> | null;
      try { packet = JSON.parse(String(event.data)) as Record<string, unknown> | null; }
      catch { return; }
      if (!packet || typeof packet !== 'object') return;
      if (packet.type === 'snapshot' && Array.isArray(packet.events)) {
        // Only a real snapshot, even an empty one, completes synchronization.
        // Status-only frames and unrelated packets cannot keep a broken
        // connection alive indefinitely.
        const rows = packet.events.slice(-1500).filter(validLiquidation);
        if (!hasSnapshot) {
          hasSnapshot = true;
          snapshotAt = Date.now();
          clearSnapshotDeadline();
        }
        try { onSnapshot(rows, packet.connected === true); } catch { /* isolate the chart */ }
      } else if (packet.type === 'liquidation' && validLiquidation(packet.event)) {
        try { onLiquidation(packet.event); } catch { /* isolate the chart */ }
      } else if (packet.type === 'status') {
        reportStatus(packet.connected === true);
      }
    };
    current.onerror = reconnect;
    current.onclose = reconnect;
    // Browser WebSocket.connect may hang indefinitely, or the relay may
    // accept the socket without delivering the required initial snapshot.
    snapshotDeadline = setTimeout(() => {
      if (!hasSnapshot) reconnect();
    }, INITIAL_SNAPSHOT_TIMEOUT_MS);
  };

  reportStatus(false);
  connect();
  return () => {
    stopped = true;
    clearSnapshotDeadline();
    if (retry) clearTimeout(retry);
    retry = null;
    const current = socket;
    socket = null;
    try { current?.close(); } catch {}
  };
}
