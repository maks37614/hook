import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

/**
 * Lightweight, read-only process telemetry for successive operator snapshots.
 * CPU percent is normalized to ONE core, matching docker stats (100% = 1 vCPU).
 * First sample has no interval and intentionally reports null utilization.
 */
export class RuntimeMetrics {
  private readonly histogram = monitorEventLoopDelay({ resolution: 20 });
  private previousCpu = process.cpuUsage();
  private previousWall = process.hrtime.bigint();
  private previousElu = performance.eventLoopUtilization();

  constructor() { this.histogram.enable(); }

  sample() {
    const currentWall = process.hrtime.bigint();
    const cpu = process.cpuUsage(this.previousCpu);
    const elapsedMicros = Number(currentWall - this.previousWall) / 1_000;
    const elu = performance.eventLoopUtilization(this.previousElu);

    this.previousWall = currentWall;
    this.previousCpu = process.cpuUsage();
    this.previousElu = performance.eventLoopUtilization();

    const cpuPercentOneCore = elapsedMicros > 0
      ? Math.max(0, Math.round(((cpu.user + cpu.system) / elapsedMicros) * 10_000) / 100)
      : null;
    const loopPercent = Number.isFinite(elu.utilization)
      ? Math.round(elu.utilization * 10_000) / 100 : null;
    const p95Nano = this.histogram.percentile(95);
    const maxNano = this.histogram.max;
    const p95Ms = Number.isFinite(p95Nano) && p95Nano > 0
      ? Math.round(p95Nano / 10_000) / 100 : null;
    // Each operator sample measures its own interval instead of mixing
    // the latest load test with cumulative healthy-runtime history.
    this.histogram.reset();

    return {
      intervalMs: Math.round(elapsedMicros / 1000),
      cpuPercentOneCore,
      eventLoopUtilizationPercent: loopPercent,
      eventLoopDelayP95Ms: p95Ms,
      eventLoopDelayMaxMs: Number.isFinite(maxNano) && maxNano > 0
        ? Math.round(maxNano / 10_000) / 100 : null,
    };
  }

  close() { this.histogram.disable(); }
}
