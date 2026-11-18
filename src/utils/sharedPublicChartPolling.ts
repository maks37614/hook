/**
 * One timer/request per PUBLIC chart-data scope within a browser tab.
 * Personal analysis, alerts, orders, replay and user settings must never
 * pass through this service. Listeners receive only their scoped market data.
 */
export type SharedPublicPollerClock = {
  every: (callback: () => void, ms: number) => ReturnType<typeof setInterval>;
  cancel: (timer: ReturnType<typeof setInterval>) => void;
  now: () => number;
};
type Listener<T> = { onData: (data: T) => void; onError?: (error: unknown) => void };
type Entry = {
  listeners: Set<Listener<unknown>>;
  load: () => Promise<unknown>;
  timer: ReturnType<typeof setInterval>;
  inFlight: boolean;
  live: boolean;
  hasValue: boolean;
  value: unknown;
  lastFetchAt: number;
  interval: number;
};
const defaultClock: SharedPublicPollerClock = {
  every: (callback, ms) => setInterval(callback, ms),
  cancel: timer => clearInterval(timer),
  now: Date.now,
};

export function createSharedPublicChartPoller(clock: SharedPublicPollerClock = defaultClock) {
  const entries = new Map<string, Entry>();
  const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

  const run = async (entry: Entry) => {
    if (!entry.live || entry.inFlight || !visible()) return;
    entry.inFlight = true;
    entry.lastFetchAt = clock.now();
    try {
      const value = await entry.load();
      if (!entry.live) return;
      entry.value = value;
      entry.hasValue = true;
      for (const listener of [...entry.listeners]) {
        if (!entry.live) break;
        if (!entry.listeners.has(listener)) continue;
        try { listener.onData(value); } catch { /* keep other charts alive */ }
      }
    } catch (error) {
      if (!entry.live) return;
      for (const listener of [...entry.listeners]) {
        try { listener.onError?.(error); } catch { /* isolate listeners */ }
      }
    } finally { entry.inFlight = false; }
  };

  const onVisibility = () => {
    if (!visible()) return;
    for (const entry of entries.values()) {
      if (clock.now() - entry.lastFetchAt >= entry.interval) void run(entry);
    }
  };
  const subscribe = <T>(
    key: string,
    load: () => Promise<T>,
    listener: Listener<T>,
    intervalMs = 60_000,
  ): (() => void) => {
    if (!key || key.length > 400) throw new Error('Invalid public chart polling key');
    let entry = entries.get(key);
    if (!entry) {
      const timerInterval = Math.max(10_000, intervalMs);
      const next: Entry = {
        listeners: new Set(), load, timer: null as unknown as ReturnType<typeof setInterval>,
        inFlight: false, live: true, hasValue: false, value: undefined,
        lastFetchAt: 0, interval: timerInterval,
      };
      next.timer = clock.every(() => void run(next), timerInterval);
      const first = entries.size === 0;
      entries.set(key, next);
      if (first && typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisibility);
      }
      entry = next;
      void run(entry);
    }
    const current = entry;
    current.listeners.add(listener as Listener<unknown>);
    if (current.hasValue && clock.now() - current.lastFetchAt < current.interval) {
      try { listener.onData(current.value as T); } catch { /* isolate listeners */ }
    } else if (!current.inFlight) {
      // A late join must never receive an arbitrarily old OI/statistics page.
      void run(current);
    }
    return () => {
      current.listeners.delete(listener as Listener<unknown>);
      if (current.listeners.size || entries.get(key) !== current) return;
      current.live = false;
      clock.cancel(current.timer);
      entries.delete(key);
      if (!entries.size && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  };
  return { subscribe, activeKeys: () => entries.size };
}

export const sharedPublicChartPolling = createSharedPublicChartPoller();
