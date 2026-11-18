/**
 * The full exchange catalog is read on demand by Terminal coin pickers.
 * Only OPEN pickers subscribe to catalog changes. Closed chart cards receive
 * neither the 2,000+ coin array nor rerenders on every quote refresh.
 */
export function createTerminalCoinPickerStore<T>(initial: T[] = []) {
  let current = initial;
  const listeners = new Set<() => void>();

  return {
    get: () => current,
    set: (coins: T[]) => {
      if (current === coins) return;
      current = coins;
      for (const listener of [...listeners]) {
        if (!listeners.has(listener)) continue;
        try { listener(); } catch { /* an unmounted picker must not affect peers */ }
      }
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    listeners: () => listeners.size,
  };
}
