import { useSyncExternalStore } from 'react';

/** A single countdown clock for all visible live HookCharts in one browser tab. */
const subscribers = new Set<() => void>();
let snapshot = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;

const notify = () => {
  const next = Date.now();
  if (Math.floor(snapshot / 1000) === Math.floor(next / 1000)) return;
  snapshot = next;
  for (const listener of [...subscribers]) listener();
};
const visible = () => {
  if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
  notify();
};
const subscribe = (listener: () => void): (() => void) => {
  subscribers.add(listener);
  if (subscribers.size === 1) {
    timer = setInterval(visible, 1000);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visible);
  }
  visible();
  return () => {
    subscribers.delete(listener);
    if (subscribers.size) return;
    if (timer !== null) clearInterval(timer);
    timer = null;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visible);
  };
};
const idle = (_listener: () => void) => () => {};
const getSnapshot = () => snapshot;

/**
 * No subscription for historical Replay: its clock follows saved candles,
 * not real-world time. Also avoids one interval per hidden countdown.
 */
export function useSharedChartClock(enabled: boolean): number {
  return useSyncExternalStore(enabled ? subscribe : idle, getSnapshot, getSnapshot);
}
