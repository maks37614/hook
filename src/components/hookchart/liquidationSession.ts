/**
 * Per-browser-tab, per-exchange/instrument liquidation totals.
 * Candle timeframe and display thresholds intentionally do not participate in the key.
 */
import { canonicalLiquidationId } from './liquidationDisplay';

export type SessionLiquidation = {
  id: string;
  side: 'LONG' | 'SHORT';
  usd: number;
  t: number;
};

export type SessionLiquidationTotals = Readonly<{
  totalUsd: number;
  longUsd: number;
  shortUsd: number;
  count: number;
}>;

export const EMPTY_SESSION_LIQUIDATIONS: SessionLiquidationTotals = Object.freeze({
  totalUsd: 0, longUsd: 0, shortUsd: 0, count: 0,
});

type SeenEvent = { side: 'LONG' | 'SHORT'; usd: number };
type SessionState = { totals: SessionLiquidationTotals; seen: Map<string, SeenEvent> };
const PREFIX = 'hookchart:liquidations:session:v1:';
const START_KEY = 'hookchart:liquidations:session:start:v1';
const states = new Map<string, SessionState>();
const listeners = new Map<string, Set<() => void>>();
const pendingStorage = new Set<string>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;
// Serializing every liquidation ID after each 400 ms burst becomes very
// expensive during long sessions. Pagehide and backgrounding still flush
// immediately, so normal continuous streams can safely batch these writes.
const PERSIST_DELAY_MS = 3000;

function storage(): Storage | null {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; }
  catch { return null; }
}

const SESSION_STARTED_AT = (() => {
  const target = storage();
  try {
    const saved = target?.getItem(START_KEY);
    const number = saved ? Number(saved) : NaN;
    if (Number.isSafeInteger(number) && number > 0 && number <= Date.now()) return number;
    const startedAt = Date.now();
    target?.setItem(START_KEY, String(startedAt));
    return startedAt;
  } catch { return Date.now(); }
})();

function validTotals(value: unknown): value is SessionLiquidationTotals {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return ['totalUsd', 'longUsd', 'shortUsd', 'count'].every(key =>
    typeof row[key] === 'number' && Number.isFinite(row[key]) && (row[key] as number) >= 0,
  );
}

function currentState(scope: string): SessionState {
  const found = states.get(scope);
  if (found) return found;
  let restored: SessionState = { totals: EMPTY_SESSION_LIQUIDATIONS, seen: new Map() };
  try {
    const raw = storage()?.getItem(PREFIX + scope);
    if (raw) {
      const parsed = JSON.parse(raw) as { totals?: unknown; ids?: unknown };
      if (validTotals(parsed.totals) && Array.isArray(parsed.ids) &&
          parsed.ids.every((entry: unknown) => Array.isArray(entry) && entry.length === 3 &&
            typeof entry[0] === 'string' && (entry[1] === 'LONG' || entry[1] === 'SHORT') &&
            typeof entry[2] === 'number' && Number.isFinite(entry[2]) && entry[2] > 0) &&
          parsed.totals.count === parsed.ids.length) {
        restored = { totals: Object.freeze(parsed.totals), seen: new Map(parsed.ids.map((row: [string, 'LONG' | 'SHORT', number]) =>
          [row[0], { side: row[1], usd: row[2] }])) };
      }
    }
  } catch { /* Storage may be unavailable or damaged: keep an isolated in-memory session. */ }
  states.set(scope, restored);
  return restored;
}

function persist(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  const target = storage();
  if (!target) { pendingStorage.clear(); return; }
  for (const scope of pendingStorage) {
    try {
      const state = currentState(scope);
      target.setItem(PREFIX + scope, JSON.stringify({ totals: state.totals, ids: [...state.seen].map(([id, value]) => [id, value.side, value.usd]) }));
      pendingStorage.delete(scope);
    } catch {
      // Never break real-time chart rendering if the tab's storage quota is exhausted.
    }
  }
}

function queuePersist(scope: string): void {
  pendingStorage.add(scope);
  if (persistTimer !== null) return;
  persistTimer = setTimeout(persist, PERSIST_DELAY_MS);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', persist);
  // Mobile browsers can freeze or discard a background tab without pagehide.
  // Persist on visibility loss to retain exact unique-ID session totals.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && pendingStorage.size) persist();
    });
  }
}

export function sessionLiquidationScope(exchange: string, marketType: string, symbol: string): string {
  return `${exchange.trim().toLowerCase()}:${marketType.trim().toLowerCase()}:${symbol.trim().toUpperCase()}`;
}

export function getSessionLiquidationTotals(scope: string): SessionLiquidationTotals {
  return currentState(scope).totals;
}

export function subscribeSessionLiquidations(scope: string, notify: () => void): () => void {
  const group = listeners.get(scope) ?? new Set<() => void>();
  group.add(notify);
  listeners.set(scope, group);
  return () => {
    group.delete(notify);
    if (group.size === 0) listeners.delete(scope);
  };
}

/** A live event is received during the session even when the exchange timestamp
 * precedes our page load (transit delay or skew). Historical snapshot entries
 * require an event timestamp inside this tab's session. */
export function recordSessionLiquidation(
  scope: string, row: SessionLiquidation, source: 'live' | 'snapshot' = 'live',
): boolean {
  if (!scope || !row.id || !Number.isSafeInteger(row.t) || row.t <= 0 ||
      (source === 'snapshot' && row.t < SESSION_STARTED_AT) ||
      !Number.isFinite(row.usd) || row.usd <= 0 ||
      (row.side !== 'LONG' && row.side !== 'SHORT')) return false;
  const state = currentState(scope);
  const id = canonicalLiquidationId(row.id);
  let previous = state.seen.get(id);
  // Older clients saved Bybit IDs without the occurrence suffix. Transfer
  // that already-counted entry to the first matching received row once;
  // additional identical rows must each contribute their own notional.
  const parts = id.split(':');
  const legacyId = parts[0] === 'byb' && (parts.length === 7 || parts.length === 8)
    ? parts.slice(0, 6).join(':') : null;
  if (!previous && legacyId) {
    const legacy = state.seen.get(legacyId);
    if (legacy?.side === row.side) {
      previous = legacy;
      state.seen.delete(legacyId);
      state.seen.set(id, legacy);
      queuePersist(scope);
    }
  }
  // Binance may update the cumulative fill of the same liquidation order.
  // Count the order once, but add only the increased notional (if any).
  if (previous && (previous.side !== row.side || row.usd <= previous.usd)) return false;
  const delta = row.usd - (previous?.usd ?? 0);
  state.seen.set(id, { side: row.side, usd: row.usd });
  const longUsd = state.totals.longUsd + (row.side === 'LONG' ? delta : 0);
  const shortUsd = state.totals.shortUsd + (row.side === 'SHORT' ? delta : 0);
  state.totals = Object.freeze({
    totalUsd: longUsd + shortUsd,
    longUsd,
    shortUsd,
    count: state.totals.count + (previous ? 0 : 1),
  });
  queuePersist(scope);
  listeners.get(scope)?.forEach(listener => listener());
  return true;
}
