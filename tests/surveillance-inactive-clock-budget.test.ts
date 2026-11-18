import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SharedWorkerAnalysisClock } from '../server/surveillance/sharedWorkerAnalysisClock';

test('500 personal watchers share one 6s analysis clock, isolate failures, and release all resources', t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const clock = new SharedWorkerAnalysisClock(6000);
  let activeExecutions = 0;
  const active = Array.from({ length: 500 }, () => ({ on: true }));
  const unsub = active.map((watcher, i) => clock.subscribe('binance:futures:BTCUSDT', () => {
    if (!watcher.on) return;
    activeExecutions++;
    if (i === 4) throw new Error('one user analysis failed');
  }));
  assert.equal(clock.stats().timers, 1);
  assert.equal(clock.stats().instruments, 1);
  assert.equal(clock.stats().subscribers, 500);
  t.mock.timers.tick(6000);
  assert.equal(activeExecutions, 500, 'one failed user does not suppress other owners');
  assert.equal(clock.stats().callbackFailures, 1);
  assert.ok(clock.stats().lastDispatchMs >= 0);
  assert.ok(clock.stats().peakDispatchMs >= clock.stats().lastDispatchMs);
  assert.ok(clock.stats().overBudgetTicks >= 0);

  for (let i = 0; i < 400; i++) active[i].on = false;
  t.mock.timers.tick(6000);
  assert.equal(activeExecutions, 600, 'inactive owners no longer run personal analysis');
  unsub.forEach(stop => stop());
  assert.equal(clock.stats().timers, 0);
  assert.equal(clock.stats().subscribers, 0);
  assert.equal(clock.stats().instruments, 0);
  t.mock.timers.tick(60_000);
  assert.equal(activeExecutions, 600, 'released analysis callbacks never re-run');
});

test('inactive CoinWorker cannot run expensive deep analysis or dispatch 24/7 alerts', () => {
  const source = readFileSync(new URL('../server/surveillance/coinWorker.ts', import.meta.url), 'utf8');
  // Both the shared tick callback and the public deep-analysis entry point
  // check the latest mutable per-owner active setting, so reactivation still
  // works automatically on the next shared market tick.
  assert.match(source, /if \(this\.isDestroyed \|\| !this\.coin\.isActive\) return;/);
  // Price-dependent analysis still needs a recent trade/ticker observation.
  assert.match(source, /if \(this\.currentPrice <= 0 \|\| !this\.streamClient\.hasFreshMarketQuote\(\) \|\|\s*this\.analysisInFlight\) return;/);
  // DOM alerts may run when the trade ticker is quiet, but NEVER if the
  // source socket or the independently synchronized public depth is stale.
  assert.match(source, /this\.streamClient\.status !== 'LIVE'/);
  assert.match(source, /!this\.orderBookEngine\.hasFreshSynchronizedDepth\(\)/);
  assert.match(source, /this\.releaseAnalysisClock = sharedWorkerAnalysisClock\.subscribe/);
  assert.match(source, /this\.coin = coin;/);
  assert.doesNotMatch(source, /setInterval\(\(\) => this\.runDeepAnalysis/,
    'CoinWorkers must never allocate an independent polling timer');
});

test('analysis fanout exposes only aggregate timing counters, not user/market metadata', () => {
  const clock = new SharedWorkerAnalysisClock(6000);
  let a = 0;
  const off = clock.subscribe('binance:futures:SECRETUSDT', () => { a++; });
  clock.runTick();
  const stats = clock.stats();
  assert.equal(a, 1);
  assert.equal(stats.ticks, 1);
  assert.equal(stats.callbackFailures, 0);
  assert.equal(stats.subscribers, 1);
  assert.equal(stats.instruments, 1);
  assert.ok(Number.isFinite(stats.lastDispatchMs));
  assert.ok(Number.isFinite(stats.peakDispatchMs));
  assert.equal(JSON.stringify(stats).includes('SECRETUSDT'), false);
  off();
});
