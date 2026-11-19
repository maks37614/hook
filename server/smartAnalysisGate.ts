/** Per-IP and total-concurrency guard for public on-demand Quant analysis.
 * Uses no timers, no external cache, and at most 4096 one-minute IP counters. */
export class SmartAnalysisGate {
  private windows = new Map<string, { count: number; resetAt: number }>();
  private active = 0;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxPerMinute = 60,
    private readonly maxConcurrent = 8,
  ) {}

  enter(ip: string):
    | { status: 'ok'; release: () => void }
    | { status: 'rate_limited' | 'busy'; retryAfterSeconds: number } {
    const now = this.now();
    const key = ip || 'unknown';
    const existing = this.windows.get(key);
    if (existing && existing.resetAt > now && existing.count >= this.maxPerMinute) {
      return { status: 'rate_limited',
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
    }
    if (this.active >= this.maxConcurrent) {
      return { status: 'busy', retryAfterSeconds: 5 };
    }
    if (this.windows.size >= 4096 && (!existing || existing.resetAt <= now)) {
      for (const [address, window] of this.windows) {
        if (window.resetAt <= now) this.windows.delete(address);
      }
      // Bounded memory, even if many spoofed/rotating addresses are presented.
      if (this.windows.size >= 4096) this.windows.clear();
    }
    this.windows.set(key, existing && existing.resetAt > now
      ? { count: existing.count + 1, resetAt: existing.resetAt }
      : { count: 1, resetAt: now + 60_000 });
    this.active++;
    let released = false;
    return { status: 'ok', release: () => {
      if (!released) {
        released = true;
        this.active--;
      }
    } };
  }
}
