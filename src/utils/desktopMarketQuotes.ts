import type { MarketCoinSnapshot } from './marketCoinLoader';

// Only public, user-independent Binance/Bybit quote lists are shared. No
// auth headers, tokens, account settings, formation scans or private responses.
export interface DesktopQuoteChannel {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
}

export type DesktopQuoteLock = (
  name: string, task: () => Promise<MarketCoinSnapshot>, signal: AbortSignal,
) => Promise<MarketCoinSnapshot>;

type Cached = { snapshot: MarketCoinSnapshot; receivedAt: number };
type Message = {
  type: 'want' | 'snapshot';
  key: string;
  receivedAt?: number;
  snapshot?: MarketCoinSnapshot;
};

const MAX_CACHED_SELECTIONS = 4;
const MAX_KEY_LENGTH = 90;
const PEER_WAIT_MS = 45;
// Much less than the 40-second Screener refresh and close to the VPS' two-second
// response cache: never reuse old quotes for a whole polling interval.
export const DESKTOP_QUOTE_TTL_MS = 2_000;

function validSnapshot(value: unknown): value is MarketCoinSnapshot {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<MarketCoinSnapshot>;
  return Array.isArray(item.coins) &&
    (item.timestamp === null || typeof item.timestamp === 'number' && Number.isFinite(item.timestamp)) &&
    (item.warning === null || typeof item.warning === 'string');
}

/** A small, memory-only cache shared between h00k Desktop renderer windows.
 *
 * Web Locks serialize the initial fetch across windows sharing persist:h00k.
 * A BroadcastChannel transfers the public result to subsequent readers;
 * unsupported APIs fall back to ordinary requests, never a stale fake feed.
 */
export function createDesktopQuoteBridge(options: {
  channel: DesktopQuoteChannel | null;
  lock?: DesktopQuoteLock;
  now?: () => number;
  ttlMs?: number;
}) {
  const { channel } = options;
  // Serializing requests cannot save traffic without a working peer channel.
  // When BroadcastChannel is unavailable, keep direct requests independent.
  const lock = channel ? options.lock : undefined;
  const now = options.now || Date.now;
  const ttlMs = options.ttlMs ?? DESKTOP_QUOTE_TTL_MS;
  const recent = new Map<string, Cached>();
  const waiters = new Map<string, Set<() => void>>();

  function cached(key: string): MarketCoinSnapshot | null {
    const entry = recent.get(key);
    if (!entry) return null;
    const age = now() - entry.receivedAt;
    if (age < 0 || age >= ttlMs) {
      recent.delete(key);
      return null;
    }
    return entry.snapshot;
  }

  function record(key: string, snapshot: MarketCoinSnapshot, receivedAt: number): void {
    if (key.length > MAX_KEY_LENGTH || !Number.isFinite(receivedAt)) return;
    const age = now() - receivedAt;
    if (age < 0 || age >= ttlMs) return;
    recent.delete(key);
    recent.set(key, { snapshot, receivedAt });
    while (recent.size > MAX_CACHED_SELECTIONS) {
      const first = recent.keys().next().value;
      if (first === undefined) break;
      recent.delete(first);
    }
    for (const notify of waiters.get(key) || []) notify();
  }

  const onMessage = (event: MessageEvent<unknown>) => {
    const message = event.data as Partial<Message> | null;
    if (!message || typeof message !== 'object' ||
      typeof message.key !== 'string' || message.key.length > MAX_KEY_LENGTH) return;
    if (message.type === 'want') {
      const value = cached(message.key);
      if (value && channel) {
        const stored = recent.get(message.key)!;
        try { channel.postMessage({
          type: 'snapshot', key: message.key,
          receivedAt: stored.receivedAt, snapshot: value,
        } satisfies Message); } catch { /* another window can fetch normally */ }
      }
      return;
    }
    if (message.type === 'snapshot' && validSnapshot(message.snapshot) &&
      typeof message.receivedAt === 'number') {
      record(message.key, message.snapshot, message.receivedAt);
    }
  };
  channel?.addEventListener('message', onMessage);

  async function askPeers(key: string, signal: AbortSignal): Promise<MarketCoinSnapshot | null> {
    if (!channel) return null;
    signal.throwIfAborted();
    return new Promise<MarketCoinSnapshot | null>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const listeners = waiters.get(key) || new Set<() => void>();
      waiters.set(key, listeners);
      const finish = (value: MarketCoinSnapshot | null, error?: unknown) => {
        if (timer !== null) clearTimeout(timer);
        listeners.delete(onUpdate);
        if (!listeners.size) waiters.delete(key);
        signal.removeEventListener('abort', onAbort);
        if (error !== undefined) reject(error);
        else resolve(value);
      };
      const onUpdate = () => {
        const value = cached(key);
        if (value) finish(value);
      };
      const onAbort = () => finish(null, signal.reason || new DOMException('Aborted', 'AbortError'));
      listeners.add(onUpdate);
      signal.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => finish(null), PEER_WAIT_MS);
      try { channel.postMessage({ type: 'want', key } satisfies Message); }
      catch { finish(null); }
    });
  }

  async function read(
    key: string,
    fetchFresh: () => Promise<MarketCoinSnapshot>,
    signal: AbortSignal,
  ): Promise<MarketCoinSnapshot> {
    signal.throwIfAborted();
    const hit = cached(key);
    if (hit) return hit;
    const run = async () => {
      signal.throwIfAborted();
      const afterLock = cached(key);
      if (afterLock) return afterLock;
      const peer = await askPeers(key, signal);
      if (peer) return peer;
      signal.throwIfAborted();
      const snapshot = await fetchFresh();
      // Nothing private enters the channel, and invalid/failed results are
      // never made authoritative for other panes.
      if (validSnapshot(snapshot)) {
        const receivedAt = now();
        record(key, snapshot, receivedAt);
        if (channel) {
          try { channel.postMessage({
            type: 'snapshot', key, receivedAt, snapshot,
          } satisfies Message); } catch { /* keep local success */ }
        }
      }
      return snapshot;
    };
    return lock ? lock('h00k-desktop-public-quotes:' + key, run, signal) : run();
  }

  function close(): void {
    channel?.removeEventListener('message', onMessage);
    recent.clear();
    waiters.clear();
  }

  return { read, close };
}

let desktopBridge: ReturnType<typeof createDesktopQuoteBridge> | null = null;

export function sharedDesktopPublicQuotes() {
  if (desktopBridge) return desktopBridge;
  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('h00k-desktop-public-quotes-v1');
    }
  } catch { /* storage isolation or browser policy may disable channels */ }
  const lock: DesktopQuoteLock | undefined =
    typeof navigator !== 'undefined' && navigator.locks?.request
      ? async (key, task, signal) => await navigator.locks.request(key, { mode: 'exclusive', signal }, task)
      : undefined;
  desktopBridge = createDesktopQuoteBridge({ channel, lock });
  return desktopBridge;
}
