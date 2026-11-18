/**
 * A global price-alert pass and manual owner checks must never run together.
 * Scheduled 5-second passes are best-effort and may be skipped under load;
 * an authenticated manual request must run (or fail explicitly), never return
 * an immediate "success" merely because the background pass was busy.
 */
export class AlertManualQueueBusyError extends Error {
  constructor() {
    super('Черга ручних перевірок зайнята. Спробуйте пізніше.');
    this.name = 'AlertManualQueueBusyError';
  }
}

export class AlertCheckScheduler {
  private active: Promise<void> | null = null;
  private manualTail: Promise<void> = Promise.resolve();
  private pendingByOwner = new Map<string, Promise<void>>();
  private backgroundStarted = 0;
  private backgroundSkipped = 0;
  private manualStarted = 0;
  private manualCoalesced = 0;
  private manualRejected = 0;

  constructor(
    private readonly execute: (userId?: string) => Promise<void>,
    private readonly maxPendingManual = 16,
  ) {}

  check(userId?: string): Promise<void> {
    if (!userId) {
      // A user-specific pass refreshes the entire global price subscription
      // universe, so scheduled work can safely yield while the queue drains.
      if (this.active || this.pendingByOwner.size > 0) {
        this.backgroundSkipped++;
        return Promise.resolve();
      }
      this.backgroundStarted++;
      return this.run();
    }

    const existing = this.pendingByOwner.get(userId);
    if (existing) {
      this.manualCoalesced++;
      return existing;
    }
    if (this.pendingByOwner.size >= this.maxPendingManual) {
      this.manualRejected++;
      return Promise.reject(new AlertManualQueueBusyError());
    }

    // The per-owner map is updated synchronously before any asynchronous
    // continuation. Repeated requests from different browser tabs coalesce.
    const task = this.manualTail.then(async () => {
      // A background pass may have started before this request was queued.
      // Its failure must not silently cancel a different owner's check.
      if (this.active) await this.active.catch(() => {});
      this.manualStarted++;
      await this.run(userId);
    });
    this.pendingByOwner.set(userId, task);
    // A failed owner's check must not poison the queue for later accounts.
    this.manualTail = task.then(() => {}, () => {});
    const cleanup = () => {
      if (this.pendingByOwner.get(userId) === task) this.pendingByOwner.delete(userId);
    };
    void task.then(cleanup, cleanup);
    return task;
  }

  private run(userId?: string): Promise<void> {
    let work: Promise<void>;
    try {
      // Start the check immediately. Existing callers rely on price fetching
      // beginning before they can delete/pause an alert mid-request.
      work = this.execute(userId);
    } catch (error) {
      return Promise.reject(error);
    }
    this.active = work;
    const cleanup = () => { if (this.active === work) this.active = null; };
    void work.then(cleanup, cleanup);
    return work;
  }

  stats() {
    return {
      running: this.active !== null,
      queuedManualOwners: this.pendingByOwner.size,
      maxPendingManual: this.maxPendingManual,
      backgroundStarted: this.backgroundStarted,
      backgroundSkipped: this.backgroundSkipped,
      manualStarted: this.manualStarted,
      manualCoalesced: this.manualCoalesced,
      manualRejected: this.manualRejected,
    };
  }
}
