import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { forEachBoundedBatch } from '../server/batchedAsync';

const source = readFileSync(new URL('../server/marketService.ts', import.meta.url), 'utf8');

test('100 five-minute volatility candle requests run at most 20 concurrently', async () => {
  let active = 0;
  let maxActive = 0;
  const seen: number[] = [];
  await forEachBoundedBatch(Array.from({ length: 100 }, (_, i) => i), 20, async item => {
    active++;
    maxActive = Math.max(maxActive, active);
    seen.push(item);
    await new Promise<void>(resolve => setTimeout(resolve, item % 3));
    active--;
  });
  assert.equal(maxActive, 20);
  assert.equal(active, 0);
  assert.equal(seen.length, 100, 'all 100 symbols are processed, not dropped');
  assert.deepEqual(seen, Array.from({ length: 100 }, (_, i) => i), 'FIFO by batch');
});

test('the next batch waits for every request in the current batch', async () => {
  let finishFirst!: () => void;
  const gate = new Promise<void>(resolve => { finishFirst = resolve; });
  const started: number[] = [];
  const work = forEachBoundedBatch([0, 1, 2, 3, 4], 2, async item => {
    started.push(item);
    if (item === 0) await gate;
  });
  // First group has started but group 2 must not start until the slowest job ends.
  await Promise.resolve();
  assert.deepEqual(started, [0, 1]);
  finishFirst();
  await work;
  assert.deepEqual(started, [0, 1, 2, 3, 4]);
});

test('bounded batch executor validates concurrency and propagates failures', async () => {
  for (const size of [0, -1, 1.5, NaN, Infinity]) {
    await assert.rejects(forEachBoundedBatch([1], size, async () => {}), /positive integer/);
  }
  await assert.rejects(forEachBoundedBatch([1, 2], 1, async x => {
    if (x === 2) throw new Error('exchange down');
  }), /exchange down/);
});

test('5m volatility no longer fetches an unnecessary Binance spot universe', () => {
  // fetchMarketCoins only passes exchange-validated market tickers to enrichment.
  assert.match(source, /tickerPromises\.push\(fetchBinanceTickers\('spot', minVol, maxVol\)\)/);
  assert.match(source, /if \(c\.exchange === 'binance' && c\.marketType === 'spot'\)/);
  assert.doesNotMatch(source, /getBinanceSpotSymbols\(/);
  assert.doesNotMatch(source, /binanceSpotSymbolsCache/);
  assert.match(source, /windowSize=5m/);
  assert.match(source, /await forEachBoundedBatch\(otherPairs, 20, async c => \{/);
  assert.doesNotMatch(source, /otherChunkPromises/);
  assert.match(source, /await fetchKlines\(c\.exchange, c\.marketType, c\.symbol, '5m', 2\)/);
  assert.match(source, /volatility5mCache\.set\(key, \{ timestamp: now, volatility5mPct: vol5m \}\)/);
  assert.match(source, /volatility5mCache\.set\(key, \{ timestamp: now, volatility5mPct: est5m \}\)/);
  assert.match(source, /await Promise\.all\(binanceChunkPromises\)/);
  assert.match(source, /if \(coins\.length && !volatilityRefresh\) \{/);
});
