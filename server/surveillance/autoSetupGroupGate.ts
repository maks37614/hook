/**
 * Avoid repeating the same persisted Entry/TP/SL group lookup every six seconds.
 * Successful checks are periodically reconciled with the durable alert store:
 * an external restore/reset can still recreate a missing automatic group,
 * while manual deletion tombstones and paused/fired alerts remain authoritative.
 *
 * Only setup identities and check timestamps are retained per worker.
 */
export class AutoSetupGroupGate {
  private readonly completed = new Map<string, number>();

  constructor(
    private readonly limit = 256,
    private readonly recheckMs = 15 * 60_000,
  ) {
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new Error('Auto setup group cache limit must be a positive integer');
    if (!Number.isFinite(recheckMs) || recheckMs < 1_000)
      throw new Error('Auto setup group reconciliation interval must be at least one second');
  }

  /**
   * Returns true only when the durable group creation/check ran and succeeded.
   * A failed or thrown write is never marked as complete and remains retryable.
   */
  ensure(setupId: string, commit: () => { success: boolean }, now = Date.now()): boolean {
    if (!setupId) throw new Error('A setup identity is required');
    const last = this.completed.get(setupId);
    if (last !== undefined && now >= last && now - last < this.recheckMs)
      return false;

    // Existing alerts, manual pauses and tombstones remain governed by the
    // idempotent persistent creation function. No local cache state can rearm.
    const result = commit();
    if (!result.success) return false;
    this.completed.delete(setupId);
    this.completed.set(setupId, now);
    if (this.completed.size > this.limit)
      this.completed.delete(this.completed.keys().next().value!);
    return true;
  }

  clear(): void { this.completed.clear(); }
  size(): number { return this.completed.size; }
}
