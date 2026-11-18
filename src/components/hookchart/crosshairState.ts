export type CrosshairPosition = { x: number; time: number };

export interface ChartCrosshairStore {
  getSnapshot: () => CrosshairPosition | null;
  getServerSnapshot: () => CrosshairPosition | null;
  subscribe: (listener: () => void) => () => void;
  set: (position: CrosshairPosition | null) => void;
}

/**
 * Pointer coordinates are transient presentation data. Only the small time label
 * subscribes; publishing must never set state on the chart/indicator owner.
 */
export function createChartCrosshairStore(): ChartCrosshairStore {
  let snapshot: CrosshairPosition | null = null;
  const listeners = new Set<() => void>();
  const getSnapshot = () => snapshot;
  return {
    getSnapshot,
    getServerSnapshot: getSnapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    set(position) {
      const next = position && Number.isFinite(position.x) && Number.isFinite(position.time)
        ? position : null;
      if (next?.x === snapshot?.x && next?.time === snapshot?.time) return;
      snapshot = next ? { ...next } : null;
      for (const listener of [...listeners]) listener();
    },
  };
}
