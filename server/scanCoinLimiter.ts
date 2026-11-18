/**
 * A process-wide FIFO permit pool for heavyweight per-coin formation analysis.
 *
 * SharedScanJobs limits distinct scan jobs, while each job can process a batch
 * of 25 coins. Without a shared permit pool, 2 overlapping jobs can execute 50
 * analyses simultaneously and compete for the same exchange/CPU budget.
 *
 * A permit is transferred directly to a queued waiter on release, before any
 * new caller can enter, so active never exceeds the configured limit.
 */
export class ScanCoinLimiter {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new Error('ScanCoinLimiter limit must be a positive integer');
  }

  async run<T>(job: () => Promise<T>): Promise<T> {
    if (this.active < this.limit) {
      this.active++;
    } else {
      // The releasing job transfers its occupied permit directly; do not
      // increment active again after waking, which could exceed the limit.
      await new Promise<void>(resolve => this.waiting.push(resolve));
    }
    try {
      return await job();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }

  stats() {
    return { active: this.active, waiting: this.waiting.length, limit: this.limit };
  }
}
