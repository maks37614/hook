/**
 * One shared maintenance timer per browser tab. Each HookChart refreshes its
 * density holding-time view once per second, but callbacks are distributed
 * into five 200ms phases to avoid a synchronized 50-chart CPU spike.
 *
 * Live exchange data remains event-driven and is never throttled here.
 */
export type ChartClockSource = {
  schedule: (callback: () => void, milliseconds: number) => ReturnType<typeof setInterval>;
  cancel: (timer: ReturnType<typeof setInterval>) => void;
};

const defaultClockSource: ChartClockSource = {
  schedule: (callback, milliseconds) => setInterval(callback, milliseconds),
  cancel: timer => clearInterval(timer),
};

const PHASES = 5;
export const CHART_CLOCK_PHASE_MS = 200;

export function createSharedChartClock(source: ChartClockSource = defaultClockSource) {
  const buckets = Array.from({ length: PHASES }, () => new Set<() => void>());
  const assignments = new Map<() => void, { bucket: Set<() => void>; refs: number }>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let phase = 0;
  let count = 0;

  const pulse = () => {
    const current = buckets[phase];
    phase = (phase + 1) % PHASES;
    for (const callback of [...current]) {
      if (!current.has(callback)) continue;
      try { callback(); } catch { /* a broken chart cannot stop its peers */ }
    }
  };

  const subscribe = (callback: () => void): (() => void) => {
    let assignment = assignments.get(callback);
    if (assignment) {
      assignment.refs++;
    } else {
      // Balance work across phases even when charts mount or unmount in bursts.
      let bucket = buckets[0];
      for (const candidate of buckets) {
        if (candidate.size < bucket.size) bucket = candidate;
      }
      bucket.add(callback);
      assignment = { bucket, refs: 1 };
      assignments.set(callback, assignment);
      count++;
    }
    if (timer === null) timer = source.schedule(pulse, CHART_CLOCK_PHASE_MS);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const current = assignments.get(callback);
      if (!current) return;
      current.refs--;
      if (current.refs === 0) {
        current.bucket.delete(callback);
        assignments.delete(callback);
        count--;
      }
      if (count === 0 && timer !== null) {
        source.cancel(timer);
        timer = null;
        phase = 0;
      }
    };
  };

  return { subscribe, activeSubscribers: () => count };
}

export const sharedChartClock = createSharedChartClock();
