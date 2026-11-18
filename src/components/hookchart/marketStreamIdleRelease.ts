/**
 * Keep a public trade transport alive briefly during chart swaps, paging and
 * fullscreen transitions. Rejoining charts reuse the same socket, REST seed,
 * dedupe IDs and computed threshold instead of starting a new stream.
 *
 * This changes only shutdown timing while there are NO listeners. It never
 * delays delivery of active WebSocket trades or alters volume calculations.
 */
export function createMarketStreamIdleRelease(
  intervalMs = 1_500,
  schedule: (fn: () => void, ms: number) => ReturnType<typeof setTimeout> = setTimeout,
  cancel: (timer: ReturnType<typeof setTimeout>) => void = clearTimeout,
) {
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const cancelPending = (key: string) => {
    const timer = pending.get(key);
    if (timer !== undefined) cancel(timer);
    pending.delete(key);
  };
  return {
    cancel: cancelPending,
    defer(key: string, release: () => void) {
      cancelPending(key);
      const timer = schedule(() => {
        if (pending.get(key) !== timer) return;
        pending.delete(key);
        release();
      }, intervalMs);
      pending.set(key, timer);
    },
    pending: () => pending.size,
  };
}

export const marketStreamIdleRelease = createMarketStreamIdleRelease();
