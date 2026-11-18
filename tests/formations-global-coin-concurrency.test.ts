import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ScanCoinLimiter } from '../server/scanCoinLimiter';

test('simultaneous formation scan batches share one global per-coin concurrency cap', async () => {
  const limiter = new ScanCoinLimiter(25);
  let running = 0;
  let peak = 0;
  const tasks = Array.from({ length: 75 }, (_, index) =>
    limiter.run(async () => {
      running++;
      peak = Math.max(peak, running);
      assert.ok(limiter.stats().active <= 25);
      try {
        await new Promise<void>(resolve => setTimeout(resolve, index % 3));
        return index;
      } finally {
        running--;
      }
    }));
  assert.deepEqual(limiter.stats(), { active: 25, waiting: 50, limit: 25 });
  assert.deepEqual(await Promise.all(tasks), Array.from({ length: 75 }, (_, i) => i));
  assert.equal(peak, 25, 'a background + foreground pair cannot run 50 heavy coin checks');
  assert.deepEqual(limiter.stats(), { active: 0, waiting: 0, limit: 25 });
});

test('queued jobs acquire released permits in FIFO order and do not overbook on a new arrival', async () => {
  const limiter = new ScanCoinLimiter(1);
  const order: string[] = [];
  let finishFirst!: () => void;
  const gate = new Promise<void>(resolve => { finishFirst = resolve; });
  const first = limiter.run(async () => {
    order.push('first');
    await gate;
    return 'first';
  });
  const second = limiter.run(async () => { order.push('second'); return 'second'; });
  const third = limiter.run(async () => { order.push('third'); return 'third'; });
  assert.deepEqual(limiter.stats(), { active: 1, waiting: 2, limit: 1 });
  finishFirst();
  // New requests are queued behind older waiters, even after a permit transfers.
  const fourth = limiter.run(async () => { order.push('fourth'); return 'fourth'; });
  assert.deepEqual(await Promise.all([first, second, third, fourth]),
    ['first', 'second', 'third', 'fourth']);
  assert.deepEqual(order, ['first', 'second', 'third', 'fourth']);
  assert.equal(limiter.stats().active, 0);
  assert.equal(limiter.stats().waiting, 0);
});

test('failed per-coin analysis always releases its permit for the next scan', async () => {
  const limiter = new ScanCoinLimiter(1);
  const failed = limiter.run(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    throw new Error('exchange unavailable');
  });
  const next = limiter.run(async () => 'success');
  await assert.rejects(failed, /exchange unavailable/);
  assert.equal(await next, 'success');
  assert.deepEqual(limiter.stats(), { active: 0, waiting: 0, limit: 1 });
  await assert.rejects(limiter.run(async () => {
    throw new Error('immediate rejection');
  }), /immediate rejection/);
  assert.equal(await limiter.run(async () => 42), 42);
  assert.equal(limiter.stats().active, 0);
});

test('global limit rejects invalid configurations', () => {
  for (const limit of [0, -1, 1.2, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => new ScanCoinLimiter(limit), /positive integer/);
  }
});

test('normal and background scans share a single 25-coin limiter and a common scoring path', () => {
  const source = readFileSync(new URL('../server/marketService.ts', import.meta.url), 'utf8');
  assert.match(source, /const scanJobs = new SharedScanJobs<ScannedCoin\[\]>\(2, 16\)/);
  assert.match(source, /const scanCoinLimiter = new ScanCoinLimiter\(25\)/);
  assert.match(source, /batch\.map\(ticker => scanCoinLimiter\.run\(async \(\) => \{/);
  assert.match(source, /const BATCH_SIZE = 25/);
  assert.match(source, /await fetchKlines\(ticker\.exchange, ticker\.marketType, ticker\.symbol, params\.timeframe, 70\)/);
  assert.match(source, /detectFormations\(closedKlines, ticker\.symbol\)/);
  assert.match(source, /detectEarlyReversalFormations\(closedKlines, ticker\.symbol, baseFormations\)/);
  assert.match(source, /scoreRegularFlowQuality\(formation, regularIndicators, ticker\.exchange/);
  assert.match(source, /fetchRegularOIResult\(ticker\.exchange, ticker\.marketType, ticker\.symbol, params\.timeframe\)/);
  assert.match(source, /export const getFormationScanCoinConcurrencyStats = \(\) => scanCoinLimiter\.stats\(\)/);
});
