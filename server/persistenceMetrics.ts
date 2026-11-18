export type PersistedDataset = 'alerts' | 'alertHistory' | 'surveillance';

type WriteStats = {
  writes: number;
  failures: number;
  totalDurationMs: number;
  maxDurationMs: number;
  lastDurationMs: number;
  totalBytes: number;
  lastBytes: number;
};

const createStats = (): WriteStats => ({
  writes: 0, failures: 0, totalDurationMs: 0, maxDurationMs: 0,
  lastDurationMs: 0, totalBytes: 0, lastBytes: 0,
});

/**
 * Lightweight process-local diagnostics for synchronous JSON persistence.
 * No account IDs, alert details, tokens or file contents are recorded.
 * Accessible only through the operator-authenticated metrics endpoint.
 */
export class PersistenceMetrics {
  private readonly rows: Record<PersistedDataset, WriteStats> = {
    alerts: createStats(), alertHistory: createStats(), surveillance: createStats(),
  };

  record(kind: PersistedDataset, durationMs: number, bytes: number, success: boolean): void {
    const row = this.rows[kind];
    const duration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
    const size = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
    row.writes++;
    if (!success) row.failures++;
    row.totalDurationMs += duration;
    row.maxDurationMs = Math.max(row.maxDurationMs, duration);
    row.lastDurationMs = duration;
    if (success) row.totalBytes += size;
    row.lastBytes = size;
  }

  stats() {
    return Object.fromEntries(
      (Object.keys(this.rows) as PersistedDataset[]).map(key => {
        const { writes, failures, totalDurationMs, maxDurationMs, lastDurationMs,
          totalBytes, lastBytes } = this.rows[key];
        return [key, { writes, failures,
          avgDurationMs: writes ? Number((totalDurationMs / writes).toFixed(2)) : 0,
          maxDurationMs: Number(maxDurationMs.toFixed(2)),
          lastDurationMs: Number(lastDurationMs.toFixed(2)),
          totalBytes, lastBytes }];
      }),
    ) as Record<PersistedDataset, {
      writes: number; failures: number; avgDurationMs: number;
      maxDurationMs: number; lastDurationMs: number;
      totalBytes: number; lastBytes: number;
    }>;
  }
}

export const persistenceMetrics = new PersistenceMetrics();
