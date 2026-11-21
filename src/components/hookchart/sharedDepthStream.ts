import type { BookUpdate } from '../../utils/binanceOrderBook';
import { chartDepthScope, type ChartDepthStatus } from '../../utils/hookChartDepthProtocol';
import { isFreshDepthTime, parseDepthLevels } from '../../utils/orderBookValidation';
import { connectHookChartDepth } from './depthStream';
import { applyDepthSide } from './depthBestPrice';
import { createDesktopDepthBridge } from '../../utils/desktopDepthBridge';

type Options = Parameters<typeof connectHookChartDepth>[0];
type Subscriber = Pick<Options, 'onBook' | 'onStatus'>;
type Connector = (options: Options) => () => void;

type Entry = {
  listeners: Set<Subscriber>;
  failed: Set<Subscriber>;
  status: ChartDepthStatus;
  sequence: number;
  eventTime: number;
  bids: Map<number, number>;
  asks: Map<number, number>;
  bestBid: number;
  bestAsk: number;
  stop: () => void;
};

function currentSnapshot(entry: Entry): BookUpdate | null {
  if (entry.status !== 'live' || !entry.sequence || !isFreshDepthTime(entry.eventTime) ||
      !entry.bids.size || !entry.asks.size) return null;
  return {
    isSnapshot: true,
    sequence: entry.sequence,
    eventTime: entry.eventTime,
    bids: [...entry.bids],
    asks: [...entry.asks],
  };
}

/**
 * One server-bound depth WS per exchange/market/symbol in a browser tab.
 * Every chart retains an independent HookChartDensityBook (and settings), but
 * new charts join using a complete fresh local book, not an orphan delta.
 */
export function createSharedDepthSubscriptions(connect: Connector = connectHookChartDepth) {
  const active = new Map<string, Entry>();

  const subscribe = (options: Options): (() => void) => {
    const scope = chartDepthScope(options.exchange, options.marketType, options.symbol, options.includeRpi);
    const key = (options.origin || '') + '|' + scope;
    const listener: Subscriber = { onBook: options.onBook, onStatus: options.onStatus };
    let entry = active.get(key);
    if (entry) {
      entry.listeners.add(listener);
      const snapshot = currentSnapshot(entry);
      if (snapshot) {
        // The book always precedes LIVE: a chart cannot claim live liquidity
        // before its own local density engine has accepted that snapshot.
        // Isolate book acceptance from status delivery. In particular, a
        // throwing onStatus must not abort subscribe() before returning its
        // disposer, leaving a permanently registered chart and open socket.
        let accepted = false;
        try { accepted = listener.onBook(snapshot); } catch { /* broken chart */ }
        if (accepted) entry.failed.delete(listener);
        else entry.failed.add(listener);
        try { listener.onStatus(accepted ? 'live' : 'reconnecting'); } catch { /* isolate chart */ }
      } else {
        try {
          listener.onStatus(entry.status === 'live' ? 'reconnecting' : entry.status);
        } catch { /* still return the disposer for this subscriber */ }
      }
      return () => {
        entry!.listeners.delete(listener);
        entry!.failed.delete(listener);
        if (entry!.listeners.size === 0 && active.get(key) === entry) {
          active.delete(key);
          entry!.stop();
        }
      };
    }

    entry = {
      listeners: new Set([listener]), failed: new Set(), status: 'connecting', sequence: 0,
      eventTime: 0, bids: new Map(), asks: new Map(), bestBid: -Infinity,
      bestAsk: Infinity, stop: () => {},
    };
    const current = entry;
    active.set(key, current);
    const clear = () => {
      current.sequence = 0;
      current.eventTime = 0;
      current.bids.clear();
      current.asks.clear();
      current.bestBid = -Infinity;
      current.bestAsk = Infinity;
    };
    const fanoutStatus = (status: ChartDepthStatus) => {
      current.status = status;
      if (status !== 'live') { clear(); current.failed.clear(); }
      for (const subscriber of [...current.listeners]) {
        try { subscriber.onStatus(status === 'live' && current.failed.has(subscriber) ? 'reconnecting' : status); } catch { /* a chart never interrupts other charts */ }
      }
    };
    try {
      current.stop = connect({
        ...options,
        onBook: update => {
          const bids = parseDepthLevels(update.bids);
          const asks = parseDepthLevels(update.asks);
          const eventTime = update.eventTime ?? Date.now();
          if (!bids || !asks || !Number.isSafeInteger(update.sequence) || update.sequence <= 0 ||
              !isFreshDepthTime(eventTime)) {
            clear();
            return false;
          }
          if (update.isSnapshot) clear();
          else if (!current.sequence) return false;
          else if (update.sequence <= current.sequence) return true;
          current.bestBid = applyDepthSide(current.bids, bids, current.bestBid, true);
          current.bestAsk = applyDepthSide(current.asks, asks, current.bestAsk, false);
          if (!current.bids.size || !current.asks.size || current.bestBid >= current.bestAsk) {
            clear();
            return false;
          }
          current.sequence = update.sequence;
          current.eventTime = eventTime;
          // A broken subscriber may need an immediate full-book repair.
          // Construct it at most once per shared depth packet even if several
          // charts rejected their delta; healthy charts receive only deltas.
          let repairSnapshot: BookUpdate | null = null;
          for (const subscriber of [...current.listeners]) {
            try {
              if (!subscriber.onBook(update)) {
                const snapshot = repairSnapshot ?? (repairSnapshot = {
                  isSnapshot: true, sequence: current.sequence, eventTime,
                  bids: [...current.bids], asks: [...current.asks],
                });
                if (!subscriber.onBook(snapshot)) {
                  current.failed.add(subscriber);
                  subscriber.onStatus('reconnecting');
                } else current.failed.delete(subscriber);
              } else current.failed.delete(subscriber);
            } catch {
              current.failed.add(subscriber);
              try { subscriber.onStatus('reconnecting'); } catch {}
            }
          }
          return true;
        },
        onStatus: fanoutStatus,
      });
    } catch {
      active.delete(key);
      fanoutStatus('unavailable');
    }
    return () => {
      current.listeners.delete(listener);
      current.failed.delete(listener);
      if (current.listeners.size === 0 && active.get(key) === current) {
        active.delete(key);
        current.stop();
      }
    };
  };

  return { subscribe, activeScopes: () => active.size };
}

const defaultDepthManager = createSharedDepthSubscriptions();
let crossWindowDepthManager: ReturnType<typeof createSharedDepthSubscriptions> | null = null;

/** Share public exchange depth across same-origin browser tabs AND Desktop
 * windows when the browser offers Web Locks and BroadcastChannel. The existing
 * bridge checks sequence gaps and freshness, supplies full snapshots to new
 * followers and fails open to a direct source if its owner is unavailable.
 * Legacy/unsupported browsers keep the original tab-local validated feed.
 * Nothing private or user-specific is shared between windows.
 */
export function connectSharedHookChartDepth(options: Options): () => void {
  const eligible = typeof window !== 'undefined' &&
    /^https?:$/.test(window.location.protocol) &&
    typeof BroadcastChannel !== 'undefined' &&
    typeof navigator !== 'undefined' && !!navigator.locks?.request;
  if (!eligible) return defaultDepthManager.subscribe(options);
  try {
    if (!crossWindowDepthManager) {
      const bridge = createDesktopDepthBridge({
        createChannel: name => new BroadcastChannel(name),
        lock: async (name, signal, task) =>
          await navigator.locks.request(name, { mode: 'exclusive', signal }, task),
        source: defaultDepthManager.subscribe,
      });
      crossWindowDepthManager = createSharedDepthSubscriptions(bridge.subscribe);
    }
    return crossWindowDepthManager.subscribe(options);
  } catch {
    return defaultDepthManager.subscribe(options);
  }
}
