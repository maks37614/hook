import { processAuthMailJobs, pruneAuthMailHistory } from './pgIdentity';

// Process at most one outgoing auth email at a time per app process.
// Jobs are claimed with PostgreSQL SKIP LOCKED, so multiple replicas do not
// deliver the same job concurrently. A stale claim becomes retryable after 60s.
const POLL_MS = 3_000;
const CLEANUP_MS = 60 * 60 * 1000;
let running = false;
let timer: ReturnType<typeof setInterval> | undefined;
let lastCleanup = Date.now();

export function startAuthMailWorker() {
  if (timer) return;
  const poll = async () => {
    if (running) return;
    running = true;
    try {
      await processAuthMailJobs();
      if (Date.now() - lastCleanup >= CLEANUP_MS) {
        // Do not retry cleanup every 3 seconds if database is temporarily down.
        lastCleanup = Date.now();
        await pruneAuthMailHistory();
      }
    } catch {
      // Database outages must not take down charts, the screener or the server.
      console.warn('[Auth email] Outbox worker temporarily unavailable');
    } finally {
      running = false;
    }
  };
  timer = setInterval(() => { void poll(); }, POLL_MS);
  timer.unref();
  void poll();
}
