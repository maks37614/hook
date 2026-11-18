/** Fair, bounded REST fallback when the shared exchange price stream is stale.
 * A global cycle must not launch one REST request per user or tracked instrument.
 * No stale REST price is cached: an unchecked alert remains armed until a fresh
 * price is received via WebSocket or its next round-robin REST opportunity. */
export function selectRoundRobinBatch<T>(
  items: readonly T[], previousCursor: number, maxItems: number,
): { selected: T[]; nextCursor: number } {
  if (!items.length) return { selected: [], nextCursor: 0 };
  const count = Math.min(items.length, Math.max(0, Math.floor(maxItems) || 0));
  const start = Number.isFinite(previousCursor)
    ? ((Math.floor(previousCursor) % items.length) + items.length) % items.length : 0;
  const selected = Array.from({ length: count }, (_, i) => items[(start + i) % items.length]);
  return { selected, nextCursor: (start + count) % items.length };
}

export async function forEachBounded<T>(
  items: readonly T[], parallelism: number, task: (item: T) => Promise<void>,
): Promise<void> {
  const limit = Math.min(items.length, Math.max(1, Math.floor(parallelism) || 1));
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const current = next++;
      await task(items[current]);
    }
  }));
}
