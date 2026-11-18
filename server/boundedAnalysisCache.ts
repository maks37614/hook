/** Keep per-instrument smart analysis results bounded and fresh.
 * Called only when a verified result is ready; no timers or background work.
 * Cache eviction never changes the computed score or its source data. */
export function storeBoundedAnalysis<T>(
  cache: Map<string, { timestamp: number; data: T }>,
  key: string,
  data: T,
  options: { now: number; ttlMs: number; maxEntries: number },
): void {
  const { now, ttlMs, maxEntries } = options;
  for (const [oldKey, entry] of cache) {
    if (entry.timestamp > now || now - entry.timestamp >= ttlMs)
      cache.delete(oldKey);
  }
  // Moving a refreshed key to the end keeps the oldest entries first.
  cache.delete(key);
  cache.set(key, { timestamp: now, data });
  while (cache.size > maxEntries) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}
