/** A single clock for all market workers. Subscribers stay per user so no
 * private rules, alert histories or DOM thresholds are shared. The shared
 * market indicator cache is naturally reused during the grouped callbacks.
 * This reduces timers from O(subscriptions) to O(1) without slowing realtime
 * streams or changing the 6-second refresh cadence. */
export class SharedWorkerAnalysisClock {
  private readonly groups = new Map<string, Set<() => void>>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticks = 0;
  private failures = 0;
  private lastDispatchMs = 0;
  private peakDispatchMs = 0;
  private overBudgetTicks = 0;

  constructor(private readonly intervalMs = 6000) {
    if (!Number.isFinite(intervalMs) || intervalMs < 100)
      throw new Error('Analysis interval must be at least 100 milliseconds');
  }

  subscribe(marketKey: string, callback: () => void): () => void {
    if (!marketKey || typeof callback !== 'function')
      throw new Error('Market key and analysis callback are required');
    let group = this.groups.get(marketKey);
    if (!group) {
      group = new Set();
      this.groups.set(marketKey, group);
    }
    group.add(callback);
    if (!this.timer) this.timer = setInterval(() => this.runTick(), this.intervalMs);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const current = this.groups.get(marketKey);
      current?.delete(callback);
      if (!current?.size) this.groups.delete(marketKey);
      if (!this.groups.size && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  runTick() {
    const startedAt = performance.now();
    this.ticks++;
    for (const group of this.groups.values()) {
      for (const callback of group) {
        try { callback(); }
        catch { this.failures++; }
      }
    }
    // This captures the synchronous analysis work kicked off by callbacks,
    // not their later network awaits. No account or market IDs are exported.
    this.lastDispatchMs = Math.max(0, performance.now() - startedAt);
    this.peakDispatchMs = Math.max(this.peakDispatchMs, this.lastDispatchMs);
    if (this.lastDispatchMs > this.intervalMs) this.overBudgetTicks++;
  }
  stats() {
    let subscribers = 0;
    for (const group of this.groups.values()) subscribers += group.size;
    return { instruments: this.groups.size, subscribers, timers: this.timer ? 1 : 0,
      ticks: this.ticks, callbackFailures: this.failures,
      lastDispatchMs: this.lastDispatchMs, peakDispatchMs: this.peakDispatchMs,
      overBudgetTicks: this.overBudgetTicks };
  }
}
export const sharedWorkerAnalysisClock = new SharedWorkerAnalysisClock();
