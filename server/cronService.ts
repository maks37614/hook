import { checkAlertsOnce, loadAlerts, getAllAlerts } from './alertService';
import { checkCoinSurveillance, getAllActiveSurveillanceCoins, findSurveillanceCoinById, commitSurveillanceCheck, flushDeferredSurveillanceChecks, countActiveSurveillanceCoins } from './surveillanceService';
import { candleCloseCheckPlanner } from './surveillance/candleCloseCheckPlanner';
import { runBackgroundFormationScans } from './marketService';
import { getUserTelegram } from './userTelegram';
import { surveillanceManager } from './surveillance/surveillanceManager';
import { hasFreshSurveillanceCheck, wasSurveillanceCheckCommitted } from './surveillance/checkResult';
import { isCronJobHealthy } from './cronHealth';

export interface CronJobStatus {
  id: string;
  name: string;
  intervalMs: number;
  lastRunAt: string | null;
  lastDurationMs: number;
  runCount: number;
  errorCount: number;
  lastError: string | null;
  isRunning: boolean;
  enabled: boolean;
}

export interface CronSystemStatus {
  uptimeSeconds: number;
  startedAt: string;
  isHealthy: boolean;
  jobs: Record<string, CronJobStatus>;
  stats: {
    totalAlertsMonitored: number;
    activeAlertsCount: number;
    surveillanceCoinsMonitored: number;
    telegramConfigured: boolean;
  };
}

export class CronManager {
  private startTime: number = Date.now();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private startupTimers = new Map<string, NodeJS.Timeout>();
  private stopped = false;

  /** An initial one-shot run must be cancelled on stop or reinitialization,
   * just like the periodic timers. */
  private scheduleStartup(jobId: string, run: () => Promise<void>, delayMs: number) {
    const old = this.startupTimers.get(jobId);
    if (old) clearTimeout(old);
    const timer = setTimeout(() => {
      this.startupTimers.delete(jobId);
      if (!this.stopped) void run();
    }, delayMs);
    this.startupTimers.set(jobId, timer);
  }
  // Continue large surveillance passes fairly instead of always starting at user #1.
  private surveillanceCursor = 0;

  private jobs: Record<string, CronJobStatus> = {
    price_alerts: {
      id: 'price_alerts',
      name: 'Цінові сповіщення (Binance & Bybit)',
      intervalMs: 5000,
      lastRunAt: null,
      lastDurationMs: 0,
      runCount: 0,
      errorCount: 0,
      lastError: null,
      isRunning: false,
      enabled: true,
    },
    surveillance: {
      id: 'surveillance',
      name: '24/7 Нагляд за ринком (Імпульси, Сплески, Рівні)',
      intervalMs: 15000,
      lastRunAt: null,
      lastDurationMs: 0,
      runCount: 0,
      errorCount: 0,
      lastError: null,
      isRunning: false,
      enabled: true,
    },
    screener_patterns: {
      id: 'screener_patterns',
      name: 'Скринер патернів високої впевненості (≥88%)',
      intervalMs: 60000,
      lastRunAt: null,
      lastDurationMs: 0,
      runCount: 0,
      errorCount: 0,
      lastError: null,
      isRunning: false,
      enabled: true,
    },
  };

  public init() {
    this.stopped = false;
    console.log('[CRON] Initializing unified background notification cron system...');
    try {
      surveillanceManager.start();
    } catch (e) {
      console.error('[CRON] Error starting surveillanceManager:', e);
    }
    this.startPriceAlertsCron();
    this.startSurveillanceCron();
    this.startScreenerCron();
  }

  // --- 1. Price Alerts Cron (Every 5s) ---
  private startPriceAlertsCron() {
    const job = this.jobs.price_alerts;
    if (this.timers.has(job.id)) clearInterval(this.timers.get(job.id)!);

    const run = async () => {
      if (this.stopped || job.isRunning || !job.enabled) return;
      job.isRunning = true;
      const start = Date.now();
      try {
        await checkAlertsOnce();
        job.lastRunAt = new Date().toISOString();
        job.lastDurationMs = Date.now() - start;
        job.runCount++;
        job.lastError = null;
      } catch (err: any) {
        job.errorCount++;
        job.lastError = err?.message || 'Помилка виконання перевірки цінових сповіщень';
        console.error('[CRON:price_alerts] Error:', err);
      } finally {
        job.isRunning = false;
      }
    };

    // Run first iteration after 1.5s
    this.scheduleStartup(job.id, run, 1500);
    const timer = setInterval(run, job.intervalMs);
    this.timers.set(job.id, timer);
  }

  // --- 2. Surveillance Cron: candle-aware, bounded and batched ---
  private startSurveillanceCron() {
    const job = this.jobs.surveillance;
    if (this.timers.has(job.id)) clearInterval(this.timers.get(job.id)!);

    const run = async () => {
      if (this.stopped || job.isRunning || !job.enabled) return;
      job.isRunning = true;
      const start = Date.now();
      let lastPersistAt = start;
      let incompleteChecks = 0;
      try {
        const activeItems = getAllActiveSurveillanceCoins();
        const activeKeys = new Set(activeItems.map(({ userId, coin }) =>
          JSON.stringify([userId, coin.id])));
        candleCloseCheckPlanner.prune(activeKeys);
        const count = activeItems.length;
        if (count) {
          const first = this.surveillanceCursor % count;
          let examined = 0;
          for (; examined < count; examined++) {
            if (this.stopped) break;
            const { userId, coin } = activeItems[(first + examined) % count];
            const key = JSON.stringify([userId, coin.id]);
            const now = Date.now();
            if (!candleCloseCheckPlanner.due(key, coin.config, now)) continue;
            try {
              // A paused/deleted coin must not be resurrected by an older snapshot.
              const fresh = findSurveillanceCoinById(coin.id, userId)?.coin;
              if (!fresh || !fresh.isActive) continue;
              const { coin: checked } = await checkCoinSurveillance(fresh, {
                forceCheck: false, forceNotify: false,
              });
              // Routine observations are written together, while a real Telegram
              // delivery is persisted immediately by commitSurveillanceCheck.
              const committed = commitSurveillanceCheck(checked, { deferPersist: true });
              if (!committed || !committed.lastCheckedAt
                || committed.lastCheckedAt === fresh.lastCheckedAt
                || !candleCloseCheckPlanner.hasLatestClosedBars(
                  fresh.config, committed.state?.lastProcessedCandleTimes, Date.now())) {
                // A stale/partial candle snapshot is NOT a completed check.
                candleCloseCheckPlanner.failed(key, fresh.config, Date.now());
                incompleteChecks++;
              } else {
                candleCloseCheckPlanner.succeeded(key, fresh.config, Date.now());
              }
            } catch (coinErr) {
              incompleteChecks++;
              candleCloseCheckPlanner.failed(key, coin.config, Date.now());
              console.error(`[CRON:surveillance] Error on ${coin.symbol}:`, coinErr);
            }
            if (Date.now() - lastPersistAt >= 5_000) {
              if (!flushDeferredSurveillanceChecks()) {
                incompleteChecks++;
                console.error('[CRON:surveillance] Failed to flush deferred observations');
              }
              lastPersistAt = Date.now();
            }
            // Keep the event loop responsive during a large backlog. The next
            // pass resumes at the next owner instead of starving later accounts.
            if (Date.now() - start >= 10_000) { examined++; break; }
          }
          this.surveillanceCursor = (first + examined) % count;
        } else {
          this.surveillanceCursor = 0;
        }

        job.lastDurationMs = Date.now() - start;
        job.runCount++;
        if (incompleteChecks) {
          job.errorCount++;
          job.lastError = `24/7 нагляд: ${incompleteChecks} неповних перевірок або помилок запису`;
        } else {
          job.lastRunAt = new Date().toISOString();
          job.lastError = null;
        }
      } catch (err: any) {
        job.errorCount++;
        job.lastError = err?.message || 'Помилка виконання нагляду';
        console.error('[CRON:surveillance] Error:', err);
      } finally {
        if (!flushDeferredSurveillanceChecks()) {
          job.errorCount++;
          job.lastError = '24/7 нагляд: не вдалося зберегти перевірки';
          console.error('[CRON:surveillance] Failed to flush final observations');
        }
        job.isRunning = false;
      }
    };

    this.scheduleStartup(job.id, run, 3000);
    const timer = setInterval(run, job.intervalMs);
    this.timers.set(job.id, timer);
  }

  // --- 3. Screener Patterns Cron (Every 60s) ---
  private startScreenerCron() {
    const job = this.jobs.screener_patterns;
    if (this.timers.has(job.id)) clearInterval(this.timers.get(job.id)!);

    const run = async () => {
      if (this.stopped || job.isRunning || !job.enabled) return;
      job.isRunning = true;
      const start = Date.now();
      try {
        // One bounded worker prepares configured TFs within the same total budget.
        await runBackgroundFormationScans();

        job.lastRunAt = new Date().toISOString();
        job.lastDurationMs = Date.now() - start;
        job.runCount++;
        job.lastError = null;
      } catch (err: any) {
        job.errorCount++;
        job.lastError = err?.message || 'Помилка скринера патернів';
      } finally {
        job.isRunning = false;
      }
    };

    this.scheduleStartup(job.id, run, 10000);
    const timer = setInterval(run, job.intervalMs);
    this.timers.set(job.id, timer);
  }

  // --- Manual Run Trigger ---
  // This legacy/operator entry point is not the authenticated per-user HTTP
  // route. Never claim that a skipped/failed coin was successfully checked.
  public async triggerJob(jobId: string): Promise<{ success: boolean; message: string; durationMs?: number }> {
    if (!['all', 'price_alerts', 'surveillance'].includes(jobId))
      return { success: false, message: `Невідоме завдання cron: ${jobId}` };

    const started = Date.now();
    const tasks: Promise<void>[] = [];
    if (jobId !== 'surveillance') {
      tasks.push(checkAlertsOnce());
    }
    if (jobId !== 'price_alerts') {
      tasks.push((async () => {
        const active = getAllActiveSurveillanceCoins();
        // Keep the operator "all" shortcut bounded; report remaining work
        // as incomplete rather than issuing an unbounded exchange API burst.
        const batch = jobId === 'all' ? active.slice(0, 5) : active;
        let failed = 0;
        for (const { coin } of batch) {
          try {
            const { coin: checked } = await checkCoinSurveillance(coin, {
              forceCheck: true, forceNotify: false,
            });
            if (!hasFreshSurveillanceCheck(coin, checked)) throw new Error('No fresh market state');
            const committed = commitSurveillanceCheck(checked);
            if (!wasSurveillanceCheckCommitted(checked, committed))
              throw new Error('Surveillance state was not persisted');
          } catch (error) {
            failed++;
            console.error('[CRON:manual] Surveillance coin check failed:', error);
          }
        }
        const skipped = active.length - batch.length;
        if (failed || skipped) throw new Error(
          `Нагляд перевірено частково: ${failed} помилок, ${skipped} не перевірено`);
      })());
    }
    const results = await Promise.allSettled(tasks);
    const failures = results.filter((result): result is PromiseRejectedResult =>
      result.status === 'rejected');
    const durationMs = Date.now() - started;
    if (failures.length) {
      const message = failures.map(result =>
        result.reason instanceof Error ? result.reason.message : 'Помилка cron').join('; ');
      return { success: false, message: `Ручна перевірка не завершена: ${message}`, durationMs };
    }
    return { success: true, message: 'Обрані завдання cron виконано', durationMs };
  }

  /**
   * Read-only operation timings. No user records, tokens, destinations, or
   * payloads are exposed through the operator-only capacity endpoint.
   */
  public getOperatorJobStats() {
    return Object.values(this.jobs).map(job => ({
      id: job.id,
      intervalMs: job.intervalMs,
      lastRunAt: job.lastRunAt,
      lastDurationMs: job.lastDurationMs,
      runCount: job.runCount,
      errorCount: job.errorCount,
      isRunning: job.isRunning,
      enabled: job.enabled,
    }));
  }

  // --- System Diagnostic Status ---
  public getStatus(userId?: string): CronSystemStatus {
    const allAlerts = userId ? getAllAlerts(userId) : loadAlerts();
    const activeAlerts = allAlerts.filter((a) => a.isActive && !a.triggered);
    const surveillanceCoinsMonitored = countActiveSurveillanceCoins(userId);
    const tgConfig = getUserTelegram(userId);

    return {
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      startedAt: new Date(this.startTime).toISOString(),
      isHealthy: !this.stopped && Object.values(this.jobs).every((j) =>
        isCronJobHealthy(j, this.startTime)),
      jobs: this.jobs,
      stats: {
        totalAlertsMonitored: allAlerts.length,
        activeAlertsCount: activeAlerts.length,
        surveillanceCoinsMonitored,
        telegramConfigured: Boolean(tgConfig?.botToken && tgConfig?.chatId && tgConfig?.confirmedAt),
      },
    };
  }

  // --- Stop all cron jobs cleanly ---
  public stop() {
    this.stopped = true;
    for (const timer of this.startupTimers.values()) clearTimeout(timer);
    this.startupTimers.clear();
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
    console.log('[CRON] All cron background jobs stopped.');
  }
}

export const cronManager = new CronManager();
