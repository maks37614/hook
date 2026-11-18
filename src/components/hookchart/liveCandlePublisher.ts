import type { Kline } from '../../types';

/** Rate limit chart state commits while keeping ingestion and bar rollover immediate. */
export function createLiveCandlePublisher(
  publish: (latest: Kline, completed?: Kline) => void,
  now = () => performance.now(),
) {
  let pending: Kline | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastPublishedAt = -Infinity;

  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const flush = () => {
    clearTimer();
    if (!pending) return;
    const latest = pending;
    pending = undefined;
    lastPublishedAt = now();
    publish(latest);
  };

  return {
    push(candle: Kline, intervalMs: number, opensBar: boolean) {
      if (opensBar) {
        const completed = pending;
        clearTimer();
        pending = undefined;
        lastPublishedAt = now();
        publish(candle, completed);
        return;
      }
      pending = candle;
      const remaining = lastPublishedAt + intervalMs - now();
      if (remaining <= 0) flush();
      else timer ??= setTimeout(flush, remaining);
    },
    flush,
    clear() {
      clearTimer();
      pending = undefined;
      lastPublishedAt = -Infinity;
    },
  };
}
