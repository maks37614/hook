// Cross-window sharing is limited to PUBLIC chart support JSON; never share
// account endpoints, personalized scan output, replay orders or private keys.
export interface DesktopChartChannel {
  postMessage(data: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
}
export type DesktopChartLock = <T>(
  name: string, task: () => Promise<T>, signal: AbortSignal,
) => Promise<T>;

type Cached = { result: unknown; receivedAt: number };
type ChartMessage = {
  type: 'want' | 'result'; key: string; result?: unknown; receivedAt?: number;
};

// A pane may already have cached its own response for 55 seconds. Reuse peer
// results for only 2 seconds so a late join cannot extend stale data by a
// second full minute beyond that existing cache.
export const DESKTOP_CHART_TTL_MS = 2_000;
const MAX_KEYS = 48;
const MAX_KEY_LENGTH = 440;
const MAX_JSON_CHARS = 64 * 1024;
const PEER_WAIT_MS = 35;

export function isShareableDesktopChartURL(url: string): boolean {
  if (url.length > MAX_KEY_LENGTH || !url.startsWith('/api/') ||
      url.includes('#') || url.includes('\\')) return false;
  try {
    const parsed = new URL(url, 'https://h00k.top');
    if (parsed.pathname !== '/api/chart/trades24h' &&
        parsed.pathname !== '/api/derivatives/oi/history') return false;
    // Sharing is never enabled for any URL carrying an account identifier or
    // secrets, even if a future public endpoint adds optional auth parameters.
    for (const key of parsed.searchParams.keys()) {
      if (/token|session|user|auth|key|secret|cookie|uid|account|signature|credential|password/i.test(key)) return false;
    }
    return parsed.searchParams.has('symbol');
  } catch { return false; }
}

function validPublicResult(value: unknown): boolean {
  if (value === null || typeof value !== 'object' ||
      (!Array.isArray(value) && (value as {success?: unknown}).success === false)) return false;
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === 'string' && serialized.length > 1 &&
      serialized.length <= MAX_JSON_CHARS;
  } catch { return false; }
}

/** Share only fresh, bounded, public HookChart support responses across
 * renderer windows in persist:h00k. Nothing is stored on disk. If Web Locks
 * or BroadcastChannel are unavailable, the normal HTTP path still works.
 */
export function createDesktopChartBridge(options: {
  channel: DesktopChartChannel | null;
  lock?: DesktopChartLock;
  now?: () => number;
  ttlMs?: number;
  peerWaitMs?: number;
}) {
  const {channel} = options;
  const lock = channel ? options.lock : undefined;
  const now = options.now || Date.now;
  const ttl = Math.max(1, Math.min(DESKTOP_CHART_TTL_MS, options.ttlMs ?? DESKTOP_CHART_TTL_MS));
  const peerWait = options.peerWaitMs ?? PEER_WAIT_MS;
  const recent = new Map<string, Cached>();
  const waiters = new Map<string, Set<() => void>>();

  function current(key: string): unknown | null {
    const entry = recent.get(key);
    if (!entry) return null;
    const age = now() - entry.receivedAt;
    if (age < 0 || age >= ttl) {
      recent.delete(key);
      return null;
    }
    return entry.result;
  }
  function record(key: string, result: unknown, receivedAt: number) {
    if (!isShareableDesktopChartURL(key) || !validPublicResult(result) ||
        !Number.isFinite(receivedAt)) return;
    const age = now() - receivedAt;
    if (age < 0 || age >= ttl) return;
    recent.delete(key);
    recent.set(key, {result, receivedAt});
    while (recent.size > MAX_KEYS) {
      const first = recent.keys().next().value;
      if (first === undefined) break;
      recent.delete(first);
    }
    for (const wake of waiters.get(key) || []) wake();
  }
  const onMessage = (event: MessageEvent<unknown>) => {
    const message = event.data as Partial<ChartMessage> | null;
    if (!message || typeof message !== 'object' ||
        typeof message.key !== 'string' ||
        !isShareableDesktopChartURL(message.key)) return;
    if (message.type === 'want') {
      const result = current(message.key);
      const stored = recent.get(message.key);
      if (result !== null && stored && channel) {
        try { channel.postMessage({
          type: 'result', key: message.key, result, receivedAt: stored.receivedAt,
        } satisfies ChartMessage); } catch { /* no duplicate private fallback */ }
      }
    } else if (message.type === 'result' && typeof message.receivedAt === 'number') {
      record(message.key, message.result, message.receivedAt);
    }
  };
  channel?.addEventListener('message', onMessage);

  async function askPeer(key: string, signal: AbortSignal): Promise<unknown | null> {
    if (!channel) return null;
    signal.throwIfAborted();
    return await new Promise((resolve, reject) => {
      let completed = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const waiting = waiters.get(key) || new Set<() => void>();
      waiters.set(key, waiting);
      const finish = (result: unknown | null, error?: unknown) => {
        if (completed) return;
        completed = true;
        if (timer !== undefined) clearTimeout(timer);
        waiting.delete(onWake);
        if (!waiting.size) waiters.delete(key);
        signal.removeEventListener('abort', onAbort);
        if (error !== undefined) reject(error);
        else resolve(result);
      };
      const onWake = () => {
        const hit = current(key);
        if (hit !== null) finish(hit);
      };
      const onAbort = () => finish(null, signal.reason || new DOMException('Aborted','AbortError'));
      waiting.add(onWake);
      signal.addEventListener('abort', onAbort, {once:true});
      timer = setTimeout(() => finish(null), peerWait);
      try { channel.postMessage({type:'want',key} satisfies ChartMessage); }
      catch { finish(null); }
    });
  }

  async function read<T>(key: string, fetchFresh: () => Promise<T>, signal: AbortSignal): Promise<T> {
    signal.throwIfAborted();
    if (!channel || !isShareableDesktopChartURL(key)) return fetchFresh();
    const hit = current(key);
    if (hit !== null) return hit as T;
    const run = async (): Promise<T> => {
      signal.throwIfAborted();
      const local = current(key);
      if (local !== null) return local as T;
      const remote = await askPeer(key, signal);
      if (remote !== null) return remote as T;
      signal.throwIfAborted();
      const fresh = await fetchFresh();
      if (validPublicResult(fresh)) {
        const receivedAt = now();
        record(key, fresh, receivedAt);
        try {channel.postMessage({
          type:'result', key, receivedAt, result:fresh,
        } satisfies ChartMessage);} catch { /* keep successful local response */ }
      }
      return fresh;
    };
    return lock ? lock('h00k-desktop-public-chart:' + key, run, signal) : run();
  }
  function close() {
    channel?.removeEventListener('message',onMessage);
    recent.clear();
    waiters.clear();
  }
  return {read,close};
}

let sharedBridge: ReturnType<typeof createDesktopChartBridge> | null = null;
export function sharedDesktopPublicChartJson() {
  if (sharedBridge) return sharedBridge;
  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('h00k-desktop-public-chart-json-v1');
    }
  } catch { /* normal per-window fetch remains available */ }
  const lock: DesktopChartLock | undefined =
    typeof navigator !== 'undefined' && navigator.locks?.request
      ? async (name, task, signal) =>
          await navigator.locks.request(name, {mode:'exclusive',signal},task)
      : undefined;
  sharedBridge = createDesktopChartBridge({channel,lock});
  return sharedBridge;
}
