import type { Liquidation } from './engine';
import { canonicalLiquidationId, deduplicateLiquidations } from './liquidationDisplay';
import { connectHookChartLiquidations } from './liquidationStream';
import { createDesktopLiquidationBridge } from './desktopLiquidationBridge';

type Options = Parameters<typeof connectHookChartLiquidations>[0];
type Subscriber = Pick<Options, 'onSnapshot' | 'onLiquidation' | 'onStatus'>;
type Connector = (options: Options) => () => void;

type Entry = {
  listeners: Set<Subscriber>;
  hasSnapshot: boolean;
  connected: boolean;
  rows: Map<string, Liquidation>;
  // A bounded min-heap keeps the OLDEST exchange event at the top even when
  // packets arrive out of order or cumulative fills move a Map entry to end.
  times: TimeNode[];
  versions: Map<string, number>;
  nextVersion: number;
  lastPrunedAt: number;
  stop: () => void;
};

const RETAIN_MS = 30 * 60_000;
const MAX_ROWS = 1500;
type TimeNode = { id: string; t: number; version: number };

function pushOldest(entry: Entry, node: TimeNode): void {
  const heap = entry.times;
  let index = heap.length;
  heap.push(node);
  while (index > 0) {
    const parent = (index - 1) >> 1;
    if (heap[parent].t <= node.t) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = node;
}

function popOldest(entry: Entry): TimeNode | undefined {
  const heap = entry.times;
  const root = heap[0];
  const end = heap.pop();
  if (!root || !end || !heap.length) return root;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    if (left >= heap.length) break;
    const right = left + 1;
    const child = right < heap.length && heap[right].t < heap[left].t ? right : left;
    if (end.t <= heap[child].t) break;
    heap[index] = heap[child];
    index = child;
  }
  heap[index] = end;
  return root;
}

function rememberTime(entry: Entry, id: string, t: number): void {
  const version = ++entry.nextVersion;
  entry.versions.set(id, version);
  pushOldest(entry, { id, t, version });
}

function rebuildTimes(entry: Entry): void {
  entry.times = [];
  entry.versions.clear();
  for (const [id, row] of entry.rows) rememberTime(entry, id, row.t);
}

/** Expiration needs a full scan only occasionally, not on every liquidation.
 * Hard cap enforcement still runs on every update to avoid unbounded memory.
 */
function trimSharedLiquidations(entry: Entry, now = Date.now(), force = false): void {
  if (force || now - entry.lastPrunedAt >= 2000) {
    const oldest = now - RETAIN_MS;
    for (const [id, row] of entry.rows) {
      if (row.t < oldest) {
        entry.rows.delete(id);
        entry.versions.delete(id);
      }
    }
    entry.lastPrunedAt = now;
  }
  while (entry.rows.size > MAX_ROWS) {
    // Ignore heap records superseded by later cumulative fills or pruning.
    let oldest = popOldest(entry);
    while (oldest && entry.versions.get(oldest.id) !== oldest.version)
      oldest = popOldest(entry);
    if (!oldest) {
      rebuildTimes(entry);
      continue;
    }
    entry.rows.delete(oldest.id);
    entry.versions.delete(oldest.id);
  }
  // Repeated cumulative updates can leave stale heap nodes. Compact them
  // occasionally to keep memory bounded without sorting on every message.
  if (entry.times.length > MAX_ROWS * 3) rebuildTimes(entry);
}

/** Share a single site-bound liquidation WS per coin in the current browser tab. */
export function createSharedLiquidationSubscriptions(connect: Connector = connectHookChartLiquidations) {
  const active = new Map<string, Entry>();

  const subscribe = (options: Options): (() => void) => {
    const key = options.exchange + ':' + options.symbol.toUpperCase();
    const listener: Subscriber = {
      onSnapshot: options.onSnapshot,
      onLiquidation: options.onLiquidation,
      onStatus: options.onStatus,
    };
    let entry = active.get(key);
    if (entry) {
      trimSharedLiquidations(entry, Date.now(), true);
      entry.listeners.add(listener);
      try {
        if (entry.hasSnapshot) listener.onSnapshot([...entry.rows.values()], entry.connected);
        else listener.onStatus(entry.connected);
      } catch { /* listener errors do not break the other graphs */ }
      return () => {
        entry!.listeners.delete(listener);
        if (!entry!.listeners.size && active.get(key) === entry) {
          active.delete(key);
          entry!.stop();
        }
      };
    }
    entry = {
      listeners: new Set([listener]), hasSnapshot: false, connected: false,
      rows: new Map(), times: [], versions: new Map(), nextVersion: 0,
      lastPrunedAt: 0, stop: () => {},
    };
    const current = entry;
    active.set(key, current);

    try {
      current.stop = connect({
        ...options,
        onSnapshot: (rows, connected) => {
          // A reconnect snapshot can lag behind a live cumulative Binance
          // liquidation we already observed (for example after a server
          // restart). Never roll an order's notional backwards or erase
          // recent real events just because a snapshot is incomplete.
          const previous = current.rows;
          const merged = new Map<string, Liquidation>();
          for (const row of deduplicateLiquidations(rows)) {
            merged.set(canonicalLiquidationId(row.id), row);
          }
          const oldest = Date.now() - RETAIN_MS;
          for (const [id, row] of previous) {
            if (row.t < oldest) continue;
            const newer = merged.get(id);
            if (!newer || row.usd > newer.usd) merged.set(id, row);
          }
          current.rows = merged;
          rebuildTimes(current);
          trimSharedLiquidations(current, Date.now(), true);
          current.hasSnapshot = true;
          current.connected = connected;
          // Each independent chart still receives the initial snapshot so it
          // can calculate its own display thresholds and cascade risk.
          const snapshot = [...current.rows.values()];
          for (const subscriber of [...current.listeners]) {
            try { subscriber.onSnapshot(snapshot, connected); } catch {}
          }
        },
        onLiquidation: row => {
          const id = canonicalLiquidationId(row.id);
          const old = current.rows.get(id);
          // Binance cumulative fills may grow. Repeated events do not need a
          // new chart render and must not inflate session totals.
          if (old && row.usd <= old.usd) return;
          if (old) current.rows.delete(id);
          current.rows.set(id, row);
          rememberTime(current, id, row.t);
          trimSharedLiquidations(current);
          for (const subscriber of [...current.listeners]) {
            try { subscriber.onLiquidation(row); } catch {}
          }
        },
        onStatus: connected => {
          current.connected = connected;
          for (const subscriber of [...current.listeners]) {
            try { subscriber.onStatus(connected); } catch {}
          }
        },
      });
    } catch {
      active.delete(key);
      for (const subscriber of [...current.listeners]) {
        try { subscriber.onStatus(false); } catch {}
      }
    }
    return () => {
      current.listeners.delete(listener);
      if (!current.listeners.size && active.get(key) === current) {
        active.delete(key);
        current.stop();
      }
    };
  };
  return { subscribe, activeScopes: () => active.size };
}

const browserLiquidationSubscriptions = createSharedLiquidationSubscriptions();
let desktopLiqBridge: ReturnType<typeof createDesktopLiquidationBridge> | null = null;

/**
 * Electron's renderer panes are independent tabs. The old per-tab manager
 * remains the public-data source, with a Desktop-only cross-window bridge.
 * Without Web Locks + BroadcastChannel the original transport is untouched.
 */
export function connectSharedHookChartLiquidations(options: Options): () => void {
  const desktop = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('h00kDesktop') === '1';
  if (!desktop || typeof BroadcastChannel === 'undefined' ||
      typeof navigator === 'undefined' || !navigator.locks?.request) {
    return browserLiquidationSubscriptions.subscribe(options);
  }
  try {
    desktopLiqBridge ||= createDesktopLiquidationBridge({
      createChannel: name => new BroadcastChannel(name),
      lock: async (name, signal, task) =>
        await navigator.locks.request(name, { mode: 'exclusive', signal }, task),
      source: browserLiquidationSubscriptions.subscribe,
    });
    return desktopLiqBridge.subscribe(options);
  } catch {
    // Never suppress genuine liquidation events if cross-window sharing fails.
    return browserLiquidationSubscriptions.subscribe(options);
  }
}
