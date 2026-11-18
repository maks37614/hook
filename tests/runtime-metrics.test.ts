import test from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeMetrics } from '../server/runtimeMetrics';
import { cronManager } from '../server/cronService';

test('runtime telemetry reports valid interval CPU and event loop utilization without user data', async () => {
  const m = new RuntimeMetrics();
  try {
    m.sample();
    await new Promise<void>(resolve => setTimeout(resolve, 60));
    const result = m.sample();
    assert.ok(result.intervalMs >= 40);
    assert.ok(typeof result.cpuPercentOneCore === 'number' && Number.isFinite(result.cpuPercentOneCore));
    assert.ok(typeof result.eventLoopUtilizationPercent === 'number' &&
      result.eventLoopUtilizationPercent >= 0 && result.eventLoopUtilizationPercent <= 100);
    assert.ok(result.eventLoopDelayP95Ms === null ||
      (typeof result.eventLoopDelayP95Ms === 'number' && result.eventLoopDelayP95Ms >= 0));
    assert.ok(!JSON.stringify(result).includes('secret'));
  } finally { m.close(); }
});

test('operator job timings expose only aggregate CRON counters', () => {
  const items = cronManager.getOperatorJobStats();
  assert.ok(items.some(row => row.id === 'screener_patterns' && row.intervalMs === 60_000));
  assert.ok(items.some(row => row.id === 'surveillance' && row.intervalMs === 15_000));
  assert.ok(items.some(row => row.id === 'price_alerts' && row.intervalMs === 5_000));
  for (const row of items) {
    assert.ok(typeof row.runCount === 'number' && row.runCount >= 0);
    assert.ok(typeof row.lastDurationMs === 'number' && row.lastDurationMs >= 0);
    assert.equal('userId' in row, false);
    assert.equal('token' in row, false);
  }
});
