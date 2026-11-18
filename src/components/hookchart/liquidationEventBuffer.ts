/**
 * Bounded, exchange-ID-keyed history for one HookChart liquidation display.
 * A map makes cumulative fills and deduplicated bursts O(1) per event.
 * Reuse sorted snapshots while the inputs and age window are unchanged, so
 * periodic cascade checks do not re-sort 1,500 events for each Terminal chart.
 */
export class LiquidationEventBuffer<T extends { id: string; usd: number; t: number }> {
  private byId = new Map<string, T>();
  private revision = 0;
  private cached: {
    revision: number;
    maxAgeMs: number;
    maxRows: number;
    expiresAt: number;
    rows: T[];
  } | null = null;

  get size(): number { return this.byId.size; }

  upsert(event: T): boolean {
    const previous = this.byId.get(event.id);
    if (previous && event.usd <= previous.usd) return false;
    // Replace rather than mutate an already-published row. A cumulative
    // exchange fill must not change historical React state by reference.
    this.byId.set(event.id, event);
    this.revision++;
    return true;
  }

  replace(events: readonly T[]): void {
    this.byId.clear();
    this.revision++;
    for (const event of events) this.upsert(event);
  }

  newestEventTime(): number {
    let latest = 0;
    for (const row of this.byId.values()) latest = Math.max(latest, row.t);
    return latest;
  }

  snapshot(now = Date.now(), maxAgeMs = 30 * 60_000, maxRows = 1500): T[] {
    const keep = Number.isSafeInteger(maxRows) && maxRows >= 0 ? maxRows : 1500;
    const cached = this.cached;
    if (cached && cached.revision === this.revision &&
        cached.maxAgeMs === maxAgeMs && cached.maxRows === keep &&
        now <= cached.expiresAt) return cached.rows;

    const oldest = now - maxAgeMs;
    for (const [id, event] of this.byId) {
      if (event.t < oldest) this.byId.delete(id);
    }
    const sorted = [...this.byId.values()].sort((a, b) => a.t - b.t);
    const visible = keep === 0 ? [] : sorted.slice(-keep);
    if (visible.length !== this.byId.size) {
      this.byId = new Map(visible.map(row => [row.id, row]));
    }
    // The retention cutoff uses a strict <, so an event remains visible at
    // its exact expiry timestamp and disappears on the next millisecond.
    const expiresAt = visible.length ? visible[0].t + maxAgeMs : Infinity;
    this.cached = { revision: this.revision, maxAgeMs, maxRows: keep, expiresAt, rows: visible };
    return visible;
  }
}
