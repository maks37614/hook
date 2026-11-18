/** Recent outcomes, not the lifetime error counter, determine current health.
 * A recovered job must become healthy again; a failed job must be unhealthy
 * immediately. Disabled jobs do not degrade the scheduler status. */
export interface CronHealthSample {
  enabled: boolean;
  intervalMs: number;
  lastRunAt: string | null;
  lastError: string | null;
  isRunning: boolean;
}

export function isCronJobHealthy(job: CronHealthSample, startedAt: number, now = Date.now()): boolean {
  if (!job.enabled) return true;
  if (job.lastError) return false;
  const graceMs = Math.max(job.intervalMs * 3, 60_000);
  const lastSuccess = job.lastRunAt ? Date.parse(job.lastRunAt) : NaN;
  const anchor = Number.isFinite(lastSuccess) ? lastSuccess : startedAt;
  if (!Number.isFinite(anchor) || now < anchor) return false;
  // A long-running check gets extra grace, but cannot hang forever.
  return now - anchor <= (job.isRunning ? graceMs * 2 : graceMs);
}
