import type { Liquidation } from './engine';
import { adaptiveCut, quantile } from './marketAnalytics';
import { deduplicateLiquidations } from './liquidationDisplay';
import { LiquidationEventBuffer } from './liquidationEventBuffer';
import { nextLiquidationAdaptiveCutExpiry, nextLiquidationCascadeTransition } from './feedPublishPolicy';
import { recordSessionLiquidation, sessionLiquidationScope } from './liquidationSession';
import { connectSharedHookChartLiquidations } from './sharedLiquidationStream';

type StreamOptions = Parameters<typeof connectSharedHookChartLiquidations>[0];
type Connector = (options: StreamOptions) => () => void;

export type SharedLiquidationView = Readonly<{
  rows: Liquidation[];
  automaticCut: number;
  cascadeClock: number;
  lastEventAt: number | null;
}>;
type Listener = {
  onView: (view: SharedLiquidationView) => void;
  onStatus: (connected: boolean) => void;
};
type Subscription = Pick<StreamOptions, 'exchange' | 'symbol'> & Listener;
type Entry = {
  listeners: Set<Listener>;
  buffered: LiquidationEventBuffer<Liquidation>;
  view: SharedLiquidationView;
  connected: boolean;
  lastRows: Liquidation[] | null;
  lastAdaptiveRows: Liquidation[] | null;
  nextCascadeAt: number;
  adaptiveExpiresAt: number;
  latestEventAt: number;
  timer: ReturnType<typeof setInterval> | null;
  pending: ReturnType<typeof setTimeout> | null;
  stop: () => void;
  stopped: boolean;
};

const INITIAL_VIEW: SharedLiquidationView = {
  rows: [], automaticCut: 0, cascadeClock: 0, lastEventAt: null,
};

/** One event buffer, 2s clock, percentile calculation and session update per
 * exchange/coin per browser tab. Each HookChart still applies its own Long/
 * Short visibility and manual USD thresholds to the shared immutable view.
 */
export function createSharedLiquidationViewSubscriptions(
  connect: Connector = connectSharedHookChartLiquidations,
) {
  const entries = new Map<string, Entry>();

  function notify(entry: Entry) {
    for (const listener of [...entry.listeners]) {
      try { listener.onView(entry.view); } catch { /* one chart cannot break its peers */ }
    }
  }

  function publish(entry: Entry) {
    if (entry.stopped) return;
    if (entry.pending !== null) {
      clearTimeout(entry.pending);
      entry.pending = null;
    }
    const now = Date.now();
    const rows = entry.buffered.snapshot(now);
    const rowsChanged = rows !== entry.lastRows;
    const riskDue = now >= entry.nextCascadeAt;
    const adaptiveDue = rows !== entry.lastAdaptiveRows || now > entry.adaptiveExpiresAt;
    if (!rowsChanged && !riskDue && !adaptiveDue) return;
    let cascadeClock = entry.view.cascadeClock;
    let automaticCut = entry.view.automaticCut;
    if (rowsChanged || riskDue) {
      entry.lastRows = rows;
      cascadeClock = now;
      entry.nextCascadeAt = nextLiquidationCascadeTransition(rows, now);
    }
    if (adaptiveDue) {
      entry.lastAdaptiveRows = rows;
      entry.adaptiveExpiresAt = nextLiquidationAdaptiveCutExpiry(rows, now);
      const values = rows.filter(row => now - row.t <= 15 * 60_000)
        .map(row => row.usd).filter(value => Number.isFinite(value) && value > 0);
      const adaptive = !values.length ? 0 : values.length < 6
        ? quantile(values, .75)
        : Math.max(quantile(values, .8), adaptiveCut(values, .8, .98, 2.5));
      automaticCut = values.length ? Math.max(1000, adaptive) : 0;
    }
    entry.view = {
      rows, automaticCut, cascadeClock,
      lastEventAt: entry.latestEventAt || null,
    };
    notify(entry);
  }

  function schedule(entry: Entry) {
    if (entry.stopped || entry.pending !== null) return;
    entry.pending = setTimeout(() => {
      entry.pending = null;
      publish(entry);
    }, 200);
  }

  function subscribe(options: Subscription): () => void {
    const symbol = options.symbol.toUpperCase();
    const key = options.exchange + ':' + symbol;
    const listener: Listener = { onView: options.onView, onStatus: options.onStatus };
    let entry = entries.get(key);
    if (entry) {
      entry.listeners.add(listener);
      // Give newly mounted Terminal charts the last computed view; no new
      // sorted buffer, independent timer or exchange socket is allocated.
      try { listener.onView(entry.view); } catch {}
      try { listener.onStatus(entry.connected); } catch {}
    } else {
      entry = {
        listeners: new Set([listener]), buffered: new LiquidationEventBuffer<Liquidation>(),
        view: INITIAL_VIEW, connected: false,
        lastRows: null, lastAdaptiveRows: null, nextCascadeAt: Infinity,
        adaptiveExpiresAt: -Infinity, latestEventAt: 0,
        timer: null, pending: null, stop: () => {}, stopped: false,
      };
      entries.set(key, entry);
      const current = entry;
      const sessionScope = sessionLiquidationScope(options.exchange, 'futures', symbol);
      const status = (connected: boolean) => {
        if (current.stopped) return;
        if (current.connected === connected) return;
        current.connected = connected;
        for (const subscriber of [...current.listeners]) {
          try { subscriber.onStatus(connected); } catch {}
        }
      };
      // One timer per instrument, not per mounted HookChart.
      current.timer = setInterval(() => publish(current), 2000);
      try {
        current.stop = connect({
          exchange: options.exchange, symbol,
          onSnapshot: (events, connected) => {
            if (current.stopped) return;
            current.buffered.replace(deduplicateLiquidations(events));
            for (const row of events) recordSessionLiquidation(sessionScope, row, 'snapshot');
            current.latestEventAt = current.buffered.newestEventTime();
            status(connected);
            publish(current);
          },
          onLiquidation: row => {
            if (current.stopped || !Number.isFinite(row.usd) || row.usd <= 0) return;
            // Session total is updated exactly once no matter how many
            // charts subscribe to this symbol.
            recordSessionLiquidation(sessionScope, row);
            if (!current.buffered.upsert(row)) return;
            current.latestEventAt = Math.max(current.latestEventAt, row.t);
            schedule(current);
          },
          onStatus: status,
        });
      } catch {
        status(false);
      }
      try { listener.onView(current.view); } catch {}
      try { listener.onStatus(current.connected); } catch {}
    }

    const current = entry;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      current.listeners.delete(listener);
      if (current.listeners.size || entries.get(key) !== current) return;
      entries.delete(key);
      current.stopped = true;
      if (current.pending !== null) clearTimeout(current.pending);
      if (current.timer !== null) clearInterval(current.timer);
      current.pending = null;
      current.timer = null;
      current.stop();
    };
  }

  return {
    subscribe,
    stats: () => ({
      markets: entries.size,
      subscribers: [...entries.values()].reduce((sum, entry) => sum + entry.listeners.size, 0),
      timers: [...entries.values()].filter(entry => entry.timer !== null).length,
    }),
  };
}

export const sharedLiquidationViews = createSharedLiquidationViewSubscriptions();
