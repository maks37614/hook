/** In-process cooldown hints for the durable Telegram delivery outbox.
 * Repeated delivery history is authoritative across restarts; this cache
 * only accelerates checks during a live Node process. Entries are retained
 * for at least one day and never discarded before their original cooldown
 * expires. Reclaim old event identities instead of growing for the lifetime
 * of the server (which may monitor millions of events over time).
 */
export class NotificationCooldownCache {
  private rows = new Map<string, { at: number; expiresAt: number }>();
  private lastSweepAt = 0;

  constructor(
    private readonly retentionMs = 24 * 60 * 60_000,
    private readonly sweepIntervalMs = 60_000,
  ) {
    if (!Number.isFinite(retentionMs) || retentionMs <= 0 ||
        !Number.isFinite(sweepIntervalMs) || sweepIntervalMs <= 0)
      throw new Error('Invalid notification cooldown cache intervals');
  }

  private sweep(now: number) {
    if (!Number.isFinite(now) || now < this.lastSweepAt ||
        now - this.lastSweepAt < this.sweepIntervalMs) return;
    this.lastSweepAt = now;
    for (const [key, record] of this.rows) {
      if (record.expiresAt <= now) this.rows.delete(key);
    }
  }

  last(key: string, now = Date.now()): number {
    this.sweep(now);
    const record = this.rows.get(key);
    if (!record || record.expiresAt <= now) {
      if (record) this.rows.delete(key);
      return 0;
    }
    return record.at;
  }

  record(key: string, at = Date.now(), cooldownMs = 0) {
    if (!key || !Number.isFinite(at) || at <= 0) return;
    const windowMs = Number.isFinite(cooldownMs) && cooldownMs > 0 ? cooldownMs : 0;
    const expiry = at + Math.max(this.retentionMs, windowMs);
    // Never regress a newer observation if callbacks finish out of order.
    const previous = this.rows.get(key);
    if (previous && previous.at > at) return;
    this.rows.set(key, { at, expiresAt: expiry });
    this.sweep(at);
  }

  clear() {
    this.rows.clear();
    this.lastSweepAt = 0;
  }

  stats() { return { entries: this.rows.size }; }
}
