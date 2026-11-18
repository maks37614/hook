/** Coalesces identical heavy scans and caps *distinct* concurrent jobs.
 * Does not store any user-private data; keys must include all market parameters. */
export class SharedScanBusyError extends Error {
  constructor() { super('Сканер зайнятий. Повторіть спробу через 10 секунд.'); }
}
export class SharedScanJobs<T> {
  private jobs = new Map<string,Promise<T>>();
  private waiters: Array<() => void> = [];
  private active = 0;
  constructor(private readonly limit = 2, private readonly maxQueued = 16) {}
  run(key: string, task: () => Promise<T>): Promise<T> {
    const existing = this.jobs.get(key);
    if (existing) return existing;
    if (this.jobs.size >= this.limit + this.maxQueued)
      return Promise.reject(new SharedScanBusyError());
    const job = new Promise<T>((resolve,reject)=>{
      const start = () => {
        this.active++;
        // Remove the completed flight BEFORE resolving its callers. Otherwise
        // an immediate retry can receive stale results from the prior request.
        const finish = () => {
          this.active--;
          this.jobs.delete(key);
          this.waiters.shift()?.();
        };
        void Promise.resolve().then(task).then(
          value => { finish(); resolve(value); },
          error => { finish(); reject(error); },
        );
      };
      if (this.active < this.limit) start();
      else this.waiters.push(start);
    });
    this.jobs.set(key,job);
    return job;
  }
  stats() {return {active:this.active,uniqueJobs:this.jobs.size,waiting:this.waiters.length};}
}
