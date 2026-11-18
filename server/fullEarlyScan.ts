import { randomUUID } from 'node:crypto';
import type { ExchangeId, MarketType, ScannedCoin, Timeframe } from '../src/types';
import type { RawTicker } from './marketTickerFeed';

export interface FullEarlyScanParams {
  exchange: 'all' | ExchangeId;
  marketType: 'all' | MarketType;
  timeframe: Timeframe;
  minVolumeUsd: number;
}

export type FullEarlyScanStatus = 'loading' | 'running' | 'stopping' | 'stopped' | 'completed' | 'partial' | 'failed';
export interface FullEarlyScanSnapshot {
  id: string;
  params: FullEarlyScanParams;
  status: FullEarlyScanStatus;
  total: number;
  processed: number;
  checked: number;
  skipped: number;
  failed: number;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  message?: string;
  missingSources: string[];
  /** Only instruments with early W/M candidates, not the entire market universe. */
  data: ScannedCoin[];
}

export type EarlyScanCheck = ScannedCoin | 'checked' | 'skipped' | null;
export interface FullEarlyScanDependencies {
  loadTickers(params: FullEarlyScanParams): Promise<{
    tickers: readonly RawTicker[];
    missingSources: string[];
  }>;
  checkTicker(ticker: RawTicker, timeframe: Timeframe): Promise<EarlyScanCheck>;
  pause?(ms: number): Promise<void>;
  now?(): number;
  createId?(): string;
}

export class FullEarlyScanBusyError extends Error {
  constructor() {
    super('Повне сканування іншого ринку вже виконується. Повторіть запит пізніше.');
  }
}

/**
 * Explicit user-initiated scan sessions. No startup work or perpetual polling.
 * Sessions are shared by parameter set and strictly bounded across all clients.
 * Background formation scans keep their independent 75-candidate budget.
 */
export class FullEarlyScanManager {
  private readonly sessions = new Map<string, FullEarlyScanSnapshot>();
  private readonly cancelled = new Set<string>();
  private activeJobs = 0;
  private readonly now: () => number;
  private readonly pause: (ms: number) => Promise<void>;
  private readonly createId: () => string;

  constructor(
    private readonly deps: FullEarlyScanDependencies,
    private readonly options: {
      concurrency?: number;
      batchPauseMs?: number;
      maxActiveJobs?: number;
      cacheMs?: number;
      maxRunMs?: number;
    } = {},
  ) {
    this.now = deps.now ?? Date.now;
    this.pause = deps.pause ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
    this.createId = deps.createId ?? randomUUID;
  }

  start(params: FullEarlyScanParams, force = false): FullEarlyScanSnapshot {
    const now = this.now();
    for (const [id, scan] of this.sessions) {
      if (!['running', 'loading', 'stopping'].includes(scan.status)
        && now - (scan.finishedAt ?? scan.startedAt) > 20 * 60_000) this.sessions.delete(id);
    }
    const key = JSON.stringify(params);
    const last = [...this.sessions.values()].reverse().find(item => JSON.stringify(item.params) === key);
    if (last) {
      if (['running', 'loading', 'stopping'].includes(last.status)) return this.snapshot(last.id)!;
      const age = now - (last.finishedAt ?? last.startedAt);
      // Explicitly stopped jobs are never cached as finished market scans.
      if (last.status !== 'stopped'
        && age < (force ? 30_000 : (this.options.cacheMs ?? 4 * 60_000))) return this.snapshot(last.id)!;
    }
    if (this.activeJobs >= (this.options.maxActiveJobs ?? 2)) throw new FullEarlyScanBusyError();
    const snapshot: FullEarlyScanSnapshot = {
      id: this.createId(), params: { ...params }, status: 'loading',
      total: 0, processed: 0, checked: 0, skipped: 0, failed: 0,
      startedAt: now, updatedAt: now, missingSources: [], data: [],
    };
    this.sessions.set(snapshot.id, snapshot);
    this.activeJobs++;
    void this.run(snapshot).finally(() => { this.activeJobs--; });
    return this.snapshot(snapshot.id)!;
  }

  snapshot(id: string): FullEarlyScanSnapshot | null {
    const row = this.sessions.get(id);
    if (!row) return null;
    return { ...row, params: { ...row.params }, missingSources: [...row.missingSources], data: [...row.data] };
  }

  /** Request a graceful stop: finish in-flight checks, then never start another batch. */
  stop(id: string): FullEarlyScanSnapshot | null {
    const state = this.sessions.get(id);
    if (!state) return null;
    if (state.status === 'loading' || state.status === 'running') {
      this.cancelled.add(id);
      state.status = 'stopping';
      state.message = 'Завершуємо поточний пакет перевірок…';
      state.updatedAt = this.now();
    }
    return this.snapshot(id);
  }

  private async run(state: FullEarlyScanSnapshot): Promise<void> {
    try {
      const { tickers, missingSources } = await this.deps.loadTickers(state.params);
      // A stop during market discovery must not launch any candle requests.
      if (this.cancelled.has(state.id)) return;
      const unique = new Set<string>();
      const selected = tickers.filter(t => {
        if (t.exchange !== state.params.exchange && state.params.exchange !== 'all') return false;
        if (t.marketType !== state.params.marketType && state.params.marketType !== 'all') return false;
        if (!t.symbol.endsWith('USDT') || !Number.isFinite(t.volumeUsd)
          || t.volumeUsd < state.params.minVolumeUsd || !Number.isFinite(t.price) || t.price <= 0) return false;
        const key = `${t.exchange}:${t.marketType}:${t.symbol}`;
        if (unique.has(key)) return false;
        unique.add(key);
        return true;
      });
      state.total = selected.length;
      state.missingSources = [...missingSources];
      state.status = 'running';
      state.updatedAt = this.now();
      if (!selected.length) {
        state.status = 'failed';
        state.message = 'Біржа не повернула жодної доступної USDT-пари для повного сканування.';
        return;
      }
      const size = Math.max(1, Math.min(10, Math.floor(this.options.concurrency ?? 5)));
      const pauseMs = Math.max(0, this.options.batchPauseMs ?? 200);
      for (let offset = 0; offset < selected.length; offset += size) {
        if (this.cancelled.has(state.id)) break;
        if (this.now() - state.startedAt > (this.options.maxRunMs ?? 15 * 60_000)) {
          state.message = 'Сканування зупинено через обмеження часу. Частину інструментів не перевірено.';
          break;
        }
        const batch = selected.slice(offset, offset + size);
        const found = await Promise.all(batch.map(ticker =>
          this.deps.checkTicker(ticker, state.params.timeframe).catch(() => null)));
        for (const outcome of found) {
          state.processed++;
          if (outcome === null) state.failed++;
          else if (outcome === 'skipped') state.skipped++;
          else {
            state.checked++;
            if (outcome !== 'checked' && outcome.earlyFormations?.length) state.data.push(outcome);
          }
        }
        state.updatedAt = this.now();
        if (this.cancelled.has(state.id)) break;
        if (offset + size < selected.length && pauseMs) await this.pause(pauseMs);
      }
      if (!this.cancelled.has(state.id)) {
        state.status = state.failed || state.missingSources.length || state.processed < state.total
          ? 'partial' : 'completed';
      }
    } catch (error) {
      if (!this.cancelled.has(state.id)) {
        state.status = 'failed';
        state.message = error instanceof Error ? error.message : 'Помилка повного сканування.';
      }
    } finally {
      if (this.cancelled.delete(state.id)) {
        state.status = 'stopped';
        state.message = 'Пошук зупинено користувачем. Знайдені формації збережено.';
      }
      state.finishedAt = this.now();
      state.updatedAt = state.finishedAt;
    }
  }
}
