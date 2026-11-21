import type { ExchangeId, MarketType } from '../types';
import type { BookUpdate } from './binanceOrderBook';
import { chartDepthScope, type ChartDepthStatus } from './hookChartDepthProtocol';
import { isValidExchangeSymbol, normalizeExchangeSymbol } from './marketSymbols';
import { isFreshDepthTime, parseDepthLevels, ORDER_BOOK_MAX_AGE_MS } from './orderBookValidation';
import type { DesktopKlineChannel, DesktopKlineLock } from './desktopKlineBridge';

// Public order-book data only. Never forward settings, authentication, API
// keys, account balances, or locally computed trading signals.
export type DesktopDepthOptions = {
  exchange: ExchangeId; marketType: MarketType; symbol: string;
  origin?: string;
  includeRpi?: boolean;
  onBook: (update: BookUpdate) => boolean;
  onStatus: (status: ChartDepthStatus) => void;
};
type Source = (options: DesktopDepthOptions) => () => void;
type Packet = {
  type: 'hello' | 'heartbeat' | 'status' | 'depth' | 'bye';
  scope: string; sender: string; sentAt: number;
  status?: ChartDepthStatus; update?: BookUpdate; recipient?: string; frameNo?: number;
};

const PEER_TIMEOUT_MS = 7_000;
const TICK_MS = 2_000;
const MAX_SCOPE_COUNT = 75;
const MAX_LEVELS_PER_SIDE = 2_000;
const MAX_SCOPE_LENGTH = 170;

function validUpdate(value: unknown, now: number): value is BookUpdate {
  if (!value || typeof value !== 'object') return false;
  const update = value as Partial<BookUpdate>;
  return typeof update.isSnapshot === 'boolean' &&
    Number.isSafeInteger(update.sequence) && (update.sequence ?? 0) > 0 &&
    isFreshDepthTime(update.eventTime ?? NaN, now) &&
    Array.isArray(update.bids) && update.bids.length <= MAX_LEVELS_PER_SIDE &&
    Array.isArray(update.asks) && update.asks.length <= MAX_LEVELS_PER_SIDE &&
    parseDepthLevels(update.bids) !== null && parseDepthLevels(update.asks) !== null;
}

/** Same validation for direct browser tabs and Desktop renderer windows.
 * Scope keys contain only public exchange symbols; no account information.
 */
export function isBridgeableDepthScope(
  options: Pick<DesktopDepthOptions, 'exchange' | 'marketType' | 'symbol' | 'origin'>,
  activeScopes = 0,
  alreadyActive = false,
): boolean {
  const key = (options.origin || '') + '|' +
    chartDepthScope(options.exchange, options.marketType, options.symbol, options.includeRpi);
  return key.length <= MAX_SCOPE_LENGTH &&
    ['binance', 'bybit'].includes(options.exchange) &&
    ['futures', 'spot'].includes(options.marketType) &&
    isValidExchangeSymbol(normalizeExchangeSymbol(options.symbol)) &&
    (activeScopes < MAX_SCOPE_COUNT || alreadyActive);
}

/**
 * Use a single server-bound depth transport for each visible instrument across
 * Desktop renderer windows. Each renderer retains its own independent
 * createSharedDepthSubscriptions manager: a follower is LIVE only after that
 * manager accepts a complete, fresh snapshot and its subsequent deltas.
 *
 * The full snapshot comes from an ephemeral subscribe() to the owner's
 * already-live per-tab depth manager. This reuses its validated canonical
 * order book rather than copying/rebuilding order-book state inside the bridge.
 */
export function createDesktopDepthBridge(config: {
  createChannel: (name: string) => DesktopKlineChannel;
  lock: DesktopKlineLock;
  source: Source;
  now?: () => number;
  every?: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  cancelEvery?: (timer: ReturnType<typeof setInterval>) => void;
}) {
  const now = config.now ?? Date.now;
  const every = config.every ?? ((cb, ms) => setInterval(cb, ms));
  const cancelEvery = config.cancelEvery ?? clearInterval;
  const sender = 'depth-' + Math.random().toString(36).slice(2) + '-' + now().toString(36);
  const active = new Map<string, { stop: () => void }>();

  function subscribe(options: DesktopDepthOptions): () => void {
    const instrument = chartDepthScope(options.exchange, options.marketType, options.symbol);
    const key = (options.origin || '') + '|' + instrument;
    // Unsupported markets still use the original local WebSocket. Unicode
    // instruments are valid when the exchange accepts the same symbol.
    if (!isBridgeableDepthScope(options, active.size, active.has(key))) {
      return config.source(options);
    }
    const previous = active.get(key);
    if (previous) {
      // The normal within-tab manager owns reference counting; each scope
      // should be passed to this bridge only once by that manager.
      return config.source(options);
    }
    let channel: DesktopKlineChannel;
    try { channel = config.createChannel('h00k-desktop-public-depth-v1:' + key); }
    catch { return config.source(options); }
    const abort = new AbortController();
    let closed = false;
    let leader = false;
    let activeLeader: string | null = null;
    let lastPeerAt = 0;
    let lastBookAt = 0;
    let fallbackEventTime = 0;
    let fallbackSequence = 0;
    let publishedFrame = 0;
    let receivedFrame = 0;
    const openedAt = now();
    let peerSynced = false;
    let owned: (() => void) | null = null;
    let fallback: (() => void) | null = null;
    let releaseLock: (() => void) | null = null;

    const broadcast = (type: Packet['type'], extra: Partial<Packet> = {}) => {
      if (closed) return;
      try {
        channel.postMessage({ type, scope: key, sender, sentAt: now(), ...extra } satisfies Packet);
      } catch { /* missing browser IPC must never break native depth */ }
    };
    const report = (status: ChartDepthStatus) => {
      try { options.onStatus(status); } catch { /* chart must not crash bridge */ }
    };
    const endFallback = () => {
      const stop = fallback; fallback = null;
      fallbackEventTime = fallbackSequence = 0;
      try { stop?.(); } catch {}
    };
    const endOwned = () => {
      const stop = owned; owned = null;
      try { stop?.(); } catch {}
    };

    const beginSource = (asLeader: boolean) => {
      // Only one source per role, even when the watchdog fires repeatedly.
      if (closed || (asLeader ? !leader || owned !== null : leader || fallback !== null)) return;
      try {
        const dispose = config.source({
          ...options,
          onBook: update => {
            if (closed || leader !== asLeader) return false;
            const accepted = options.onBook(update);
            if (accepted && asLeader && validUpdate(update, now())) {
              publishedFrame++;
              broadcast('depth', { update, frameNo: publishedFrame });
            }
            if (accepted) {
              lastBookAt = now();
              if (!asLeader) {
                fallbackEventTime = update.eventTime ?? now();
                fallbackSequence = update.sequence;
              }
            }
            return accepted;
          },
          onStatus: status => {
            if (closed || leader !== asLeader) return;
            report(status);
            if (status !== 'live') {
              lastBookAt = 0;
              if (asLeader) broadcast('status', { status });
            }
          },
        });
        if (closed) { dispose(); return; }
        if (asLeader) owned = dispose;
        else fallback = dispose;
      } catch {
        report('reconnecting');
      }
    };
    const sendFreshSnapshot = (recipient: string) => {
      if (!leader || closed) return;
      // A second subscriber to an already-active shared source receives
      // exactly one validated snapshot synchronously; it opens no new socket.
      let offered = false;
      try {
        const unsubscribe = config.source({
          ...options,
          onBook: update => {
            if (!offered && update.isSnapshot && validUpdate(update, now())) {
              offered = true;
              broadcast('depth', { update, recipient, frameNo: publishedFrame });
            }
            return true;
          },
          onStatus: () => {},
        });
        unsubscribe();
      } catch { /* follower will retry or open its own fail-open source */ }
      if (!offered) broadcast('status', { status: 'reconnecting', recipient });
    };

    const onMessage = (event: MessageEvent<unknown>) => {
      const packet = event.data as Partial<Packet> | null;
      if (closed || !packet || typeof packet !== 'object' || packet.scope !== key ||
        packet.sender === sender || typeof packet.sender !== 'string' ||
        packet.sender.length > 100 || !Number.isFinite(packet.sentAt) ||
        Math.abs(now() - (packet.sentAt ?? 0)) > 3_000) return;
      if (packet.recipient && packet.recipient !== sender) return;
      if (packet.type === 'hello') {
        if (leader) {
          // Respond only to the new peer: refreshing one tab must never
          // discard a healthy local density book in the other tabs.
          sendFreshSnapshot(packet.sender);
        }
        return;
      }
      if (leader) return;
      if (packet.type === 'bye') {
        if (activeLeader === packet.sender) {
          activeLeader = null;
          lastPeerAt = 0;
          peerSynced = false;
          receivedFrame = 0;
          // Keep a healthy fail-open direct book authoritative until its
          // replacement has supplied a complete fresher snapshot.
          if (!fallback) report('reconnecting');
        }
        return;
      }
      if (!['depth', 'heartbeat', 'status'].includes(packet.type || '')) return;
      if (activeLeader && activeLeader !== packet.sender &&
        now() - lastPeerAt < PEER_TIMEOUT_MS) return;
      if (activeLeader !== packet.sender) {
        activeLeader = packet.sender!;
        peerSynced = false;
        receivedFrame = 0;
        if (!fallback) {
          lastBookAt = 0;
          report('reconnecting');
        }
      }
      lastPeerAt = now();
      if (packet.type === 'status') {
        if (packet.status !== 'live') {
          peerSynced = false;
          receivedFrame = 0;
          if (!fallback) {
            lastBookAt = 0;
            report('reconnecting');
          }
        }
        return;
      }
      if (packet.type !== 'depth') return;
      if (!validUpdate(packet.update, now()) ||
        !Number.isSafeInteger(packet.frameNo) || (packet.frameNo ?? -1) < 0) return;
      const update = packet.update;
      if (fallback && update.isSnapshot &&
        ((update.eventTime ?? 0) < fallbackEventTime ||
          (update.eventTime === fallbackEventTime && update.sequence < fallbackSequence))) {
        // A lagging leader must never replace a newer fail-open book.
        return;
      }
      // Exchange sequence numbers may skip, so an independent, contiguous
      // per-owner transport counter detects lost IPC deltas before an
      // incomplete density book can be presented as LIVE.
      if (peerSynced && !update.isSnapshot && packet.frameNo !== receivedFrame + 1) {
        peerSynced = false;
        receivedFrame = 0;
        report('reconnecting');
        broadcast('hello');
        return;
      }
      if (!update.isSnapshot && !peerSynced) {
        broadcast('hello');
        return;
      }
      if (update.isSnapshot && (!peerSynced || fallback !== null)) {
        // A complete book is required before publishing LIVE. This also
        // resets any old sequence retained from a failed fallback socket.
        report('reconnecting');
      }
      let accepted = false;
      try { accepted = options.onBook(update); } catch {}
      if (!accepted) {
        peerSynced = false;
        receivedFrame = 0;
        report('reconnecting');
        broadcast('hello');
        return;
      }
      peerSynced = true;
      receivedFrame = packet.frameNo;
      lastBookAt = now();
      if (fallback && update.isSnapshot) endFallback();
      report('live');
    };

    channel.addEventListener('message', onMessage);
    report('connecting');
    broadcast('hello');
    const watchdog = every(() => {
      if (closed) return;
      if (leader) {
        broadcast('heartbeat', { status: lastBookAt &&
          now() - lastBookAt <= ORDER_BOOK_MAX_AGE_MS ? 'live' : 'reconnecting' });
        return;
      }
      const lostPeer = !activeLeader || now() - lastPeerAt > PEER_TIMEOUT_MS;
      const staleBook = !lastBookAt || now() - lastBookAt > ORDER_BOOK_MAX_AGE_MS;
      if (staleBook && peerSynced) {
        peerSynced = false;
        if (!fallback) report('reconnecting');
      }
      const stalledBook = lastBookAt
        ? now() - lastBookAt > PEER_TIMEOUT_MS
        : now() - openedAt > PEER_TIMEOUT_MS;
      if (lostPeer || stalledBook) {
        // A peer that sends only heartbeat/status packets but no actual book
        // must not strand a chart indefinitely in SYNCING.
        if (!fallback) beginSource(false);
      } else if (!peerSynced) broadcast('hello');
    }, TICK_MS);

    void config.lock('h00k-desktop-public-depth:' + key, abort.signal, async () => {
      if (closed) return;
      leader = true;
      activeLeader = sender;
      peerSynced = false;
      receivedFrame = 0;
      publishedFrame = 0;
      lastBookAt = 0;
      endFallback();
      report('reconnecting');
      broadcast('heartbeat', { status: 'reconnecting' });
      beginSource(true);
      try {
        await new Promise<void>(resolve => { releaseLock = resolve; });
      } finally {
        releaseLock = null;
        endOwned();
        leader = false;
      }
    }).catch(() => {
      if (!closed && !leader && !fallback) beginSource(false);
    });

    const stop = () => {
      if (closed) return;
      if (leader) broadcast('bye');
      closed = true;
      abort.abort();
      endFallback();
      endOwned();
      releaseLock?.();
      releaseLock = null;
      cancelEvery(watchdog);
      channel.removeEventListener('message', onMessage);
      try { channel.close(); } catch {}
      active.delete(key);
    };
    active.set(key, { stop });
    return stop;
  }

  return {
    subscribe,
    activeScopes: () => active.size,
    close: () => {
      for (const value of [...active.values()]) value.stop();
    },
  };
}
