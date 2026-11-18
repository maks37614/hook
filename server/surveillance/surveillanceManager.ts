import { SurveillanceCoin } from '../../src/types';
import { CoinWorker, CoinWorkerSnapshot } from './coinWorker';
import { MacroAndNewsEngine } from './macroAndNewsEngine';
import { StateMachineAndAlerts } from './stateMachineAndAlerts';
import { loadSurveillanceStore } from '../surveillanceService';

export class SurveillanceManager {
  private static instance: SurveillanceManager | null = null;

  private workers = new Map<string, CoinWorker>();
  private workerKey(coinId: string, userId: string) { return JSON.stringify([userId, coinId]); }
  public readonly macroEngine = new MacroAndNewsEngine();
  public readonly alertManager = new StateMachineAndAlerts();

  private isStarted = false;
  private startupRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly startupRetryMs = 30_000;

  /** A broken or temporarily unreadable store must not permanently disable
   * all 24/7 workers. Keep one unref'ed retry instead of a busy polling loop. */
  private scheduleStartupRetry() {
    if (this.startupRetryTimer || this.isStarted) return;
    this.startupRetryTimer = setTimeout(() => {
      this.startupRetryTimer = null;
      if (!this.isStarted) this.start();
    }, this.startupRetryMs);
    this.startupRetryTimer.unref();
  }

  public static getInstance(): SurveillanceManager {
    if (!SurveillanceManager.instance) {
      SurveillanceManager.instance = new SurveillanceManager();
    }
    return SurveillanceManager.instance;
  }

  constructor() {}

  public start() {
    if (this.isStarted) return;
    console.log('[SurveillanceManager] 🛰 Starting 24/7 Surveillance Engine...');

    // Boot up active workers for all persisted coins. Commit startup only
    // after the persisted source has been loaded and every worker attached.
    // On a partial failure, startWorkerForCoin reuses existing workers safely
    // on the next attempt, so neither stream subscriptions nor timers double.
    try {
      const store = loadSurveillanceStore();
      let activeCount = 0;
      for (const [userId, coins] of Object.entries(store)) {
        if (Array.isArray(coins)) {
          for (const coin of coins) {
            if (userId !== 'guest' && coin.isActive) {
              this.startWorkerForCoin(coin);
              activeCount++;
            }
          }
        }
      }
      this.isStarted = true;
      if (this.startupRetryTimer) {
        clearTimeout(this.startupRetryTimer);
        this.startupRetryTimer = null;
      }
      console.log(`[SurveillanceManager] Successfully initialized ${activeCount} active 24/7 surveillance workers.`);
    } catch (e) {
      // A failed read previously left isStarted=true forever, even after the
      // operator repaired surveillance.json or restored disk access.
      console.error('[SurveillanceManager] Error booting workers; retrying:', e);
      this.scheduleStartupRetry();
    }
  }

  public startWorkerForCoin(coin: SurveillanceCoin): CoinWorker {
    const existing = this.workers.get(this.workerKey(coin.id, coin.userId));
    if (existing) {
      if (existing.matchesInstrument(coin)) {
        existing.updateCoin(coin);
        return existing;
      }
      // The record ID is stable, but the instrument changed. The old sockets,
      // density history, OI baseline and market timers must not follow it.
      existing.destroy();
      this.workers.delete(this.workerKey(coin.id, coin.userId));
    }

    console.log(`[SurveillanceManager] Spawning 24/7 worker for #${coin.symbol} (${coin.exchange.toUpperCase()} ${coin.marketType})`);
    const worker = new CoinWorker(coin, this.macroEngine, this.alertManager);
    this.workers.set(this.workerKey(coin.id, coin.userId), worker);
    return worker;
  }

  public updateWorkerCoin(coin: SurveillanceCoin) {
    const worker = this.workers.get(this.workerKey(coin.id, coin.userId));
    if (!worker) return;
    if (!coin.isActive) {
      this.stopWorkerForCoin(coin.id, coin.userId);
      return;
    }
    this.startWorkerForCoin(coin);
  }

  public stopWorkerForCoin(coinId: string, userId: string): boolean {
    const worker = this.workers.get(this.workerKey(coinId, userId));
    if (worker) {
      console.log(`[SurveillanceManager] Stopping worker for ${worker.coin.symbol}`);
      worker.destroy();
      this.workers.delete(this.workerKey(coinId, userId));
      return true;
    }
    return false;
  }

  public getWorker(coinId: string, userId: string): CoinWorker | undefined {
    return this.workers.get(this.workerKey(coinId, userId));
  }

  public getWorkerSnapshot(coinId: string, userId: string): CoinWorkerSnapshot | null {
    const worker = this.workers.get(this.workerKey(coinId, userId));
    return worker ? worker.getSnapshot() : null;
  }

  public getAllSnapshots(userId?: string): CoinWorkerSnapshot[] {
    const snapshots: CoinWorkerSnapshot[] = [];
    for (const worker of this.workers.values()) {
      if (!userId || worker.coin.userId === userId) {
        snapshots.push(worker.getSnapshot());
      }
    }
    return snapshots;
  }

  public getActiveWorkerCount(): number {
    return this.workers.size;
  }
}

export const surveillanceManager = SurveillanceManager.getInstance();
