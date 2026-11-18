import type { SurveillanceConfig } from '../../src/types';

const BAR_FRAMES_MS = {
  bar_close: 4 * 60 * 60_000,
  bar_close_1h: 60 * 60_000,
  bar_close_15m: 15 * 60_000,
} as const;

type SchedulerEntry = {
  version: string;
  nextAt: number;
  failures: number;
};
export class CandleCloseCheckPlanner {
  private readonly entries = new Map<string, SchedulerEntry>();
  private examined = 0;
  private skipped = 0;
  private retried = 0;
  private successful = 0;

  constructor(private readonly realtimePeriodMs = 25_000,
    private readonly closeLagMs = 2_500) {}

  private version(config: SurveillanceConfig): string {
    return JSON.stringify(config);
  }

  due(key: string, config: SurveillanceConfig, now: number): boolean {
    this.examined++;
    const stored = this.entries.get(key);
    if (!stored || stored.version !== this.version(config) || now < stored.nextAt - 2 * 86_400_000)
      return true;
    if (now >= stored.nextAt) return true;
    this.skipped++;
    return false;
  }

  /** A query returning stale or incomplete OHLCV is not a successful
   * bar-close scan, even if the timestamp of the check itself is new. */
  hasLatestClosedBars(config: SurveillanceConfig,
    processed: { '4h'?: number; '1h'?: number; '15m'?: number } | undefined,
    now: number): boolean {
    const modes=config.triggerModes || (config.triggerMode ? [config.triggerMode] : ['bar_close']);
    for (const [mode, ms] of Object.entries(BAR_FRAMES_MS)) {
      if (!modes.includes(mode as typeof modes[number])) continue;
      const timeframe = mode === 'bar_close' ? '4h'
        : mode === 'bar_close_1h' ? '1h' : '15m';
      // Latest candle whose *end* is in the past, using UTC exchange buckets.
      const expected = Math.floor(now / ms) * ms - ms;
      if (!(typeof processed?.[timeframe] === 'number') ||
          processed[timeframe]! < expected) return false;
    }
    return true;
  }

  private nextClose(config: SurveillanceConfig, now: number): number {
    const modes = config.triggerModes || (config.triggerMode ? [config.triggerMode] : ['bar_close']);
    let deadline = Infinity;
    for (const [mode, ms] of Object.entries(BAR_FRAMES_MS)) {
      if (!modes.includes(mode as typeof modes[number])) continue;
      // An exchange candle is not necessarily published at the exact boundary.
      deadline = Math.min(deadline, (Math.floor(now / ms) + 1) * ms + this.closeLagMs);
    }
    // Realtime settings still need periodic observations between candle closes.
    if (modes.includes('realtime')) deadline = Math.min(deadline, now + this.realtimePeriodMs);
    return Number.isFinite(deadline) ? deadline : now + this.realtimePeriodMs;
  }

  succeeded(key: string, config: SurveillanceConfig, now: number): void {
    this.entries.set(key, { version: this.version(config),
      nextAt: this.nextClose(config, now), failures: 0 });
    this.successful++;
  }

  failed(key: string, config: SurveillanceConfig, now: number): void {
    const previous = this.entries.get(key);
    const failures = Math.min(5, (previous?.version === this.version(config) ? previous.failures : 0) + 1);
    const delay = Math.min(120_000, 5_000 * 2 ** (failures - 1));
    this.entries.set(key, { version: this.version(config), nextAt: now + delay, failures });
    this.retried++;
  }

  prune(active: ReadonlySet<string>): void {
    for (const key of this.entries.keys()) if (!active.has(key)) this.entries.delete(key);
  }

  stats() {
    return { tracked: this.entries.size, examined: this.examined, skipped: this.skipped,
      successful: this.successful, retried: this.retried };
  }
}
export const candleCloseCheckPlanner = new CandleCloseCheckPlanner();
