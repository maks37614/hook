/**
 * Execute a bounded batch of independent public-market enrichments.
 * Await each batch before launching the next: building an array of promises
 * for ALL batches first would defeat the intended concurrency ceiling.
 */
export async function forEachBoundedBatch<T>(
  items: readonly T[],
  batchSize: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1)
    throw new Error('Batch size must be a positive integer');
  for (let offset = 0; offset < items.length; offset += batchSize) {
    await Promise.all(items.slice(offset, offset + batchSize).map(worker));
  }
}
