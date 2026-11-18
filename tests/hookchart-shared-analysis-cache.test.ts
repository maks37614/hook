import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimedRequestCache } from '../src/utils/sharedAnalysisKlines';
import { normalizeExchangeSymbol } from '../src/utils/marketSymbols';
import { readFileSync } from 'node:fs';

test('simultaneous HookChart instances share one analysis candle request', async () => {
  let now = 0, requests = 0;
  const cache = createTimedRequestCache<number[]>(45_000, 5, () => now);
  const fetcher = async () => { requests++; return [10, 11]; };
  const first = cache.load('binance:futures:BTCUSDT:1h:500', fetcher);
  const second = cache.load('binance:futures:BTCUSDT:1h:500', fetcher);
  assert.strictEqual(first, second, 'same in-flight promise is reused');
  assert.deepEqual(await Promise.all([first, second]), [[10,11],[10,11]]);
  assert.equal(requests, 1);
  assert.deepEqual(await cache.load('binance:futures:BTCUSDT:1h:500', fetcher), [10,11]);
  assert.equal(requests, 1);

  now = 45_001;
  await cache.load('binance:futures:BTCUSDT:1h:500', fetcher);
  assert.equal(requests, 2, 'expired result is refetched');
  await cache.load('bybit:futures:BTCUSDT:1h:500', fetcher);
  assert.equal(requests, 3, 'exchange scope is isolated');
});

test('failed requests are not cached; cache remains bounded', async () => {
  const cache = createTimedRequestCache<number>(10000, 2);
  await assert.rejects(cache.load('bad', async () => { throw new Error('network'); }), /network/);
  assert.equal(cache.size, 0);
  const a = await cache.load('bad', async () => 42);
  assert.equal(a, 42);
  await cache.load('2', async () => 2);
  await cache.load('3', async () => 3);
  assert.equal(cache.size, 2);
  cache.clear();
  assert.equal(cache.size, 0);
});

test('a slow pending candle load stays shared even after its nominal TTL', async () => {
  let clock = 0;
  let calls = 0;
  let resolveFirst!: (result: number[]) => void;
  const cache = createTimedRequestCache<number[]>(3_000, 3, () => clock);
  const first = cache.load('binance:futures:BTCUSDT:1m:200', async () => {
    calls++;
    return new Promise<number[]>(resolve => { resolveFirst = resolve; });
  });
  await Promise.resolve(); // ensure the first async loader has started
  clock = 12_000; // well beyond 3s TTL but the REST request is still pending
  const second = cache.load('binance:futures:BTCUSDT:1m:200', async () => {
    calls++;
    return [999];
  });
  assert.strictEqual(first, second, 'expired TTL must not spawn a duplicate in-flight exchange GET');
  assert.equal(calls, 1);
  resolveFirst([1, 2, 3]);
  assert.deepEqual(await first, [1, 2, 3]);
  // The promise cache maintenance runs as a microtask after fulfillment.
  await Promise.resolve();
  clock = 14_999;
  assert.strictEqual(cache.load('binance:futures:BTCUSDT:1m:200', async () => [999]), first,
    'finished request keeps a full 3-second TTL from completion');
  clock = 15_001;
  assert.deepEqual(await cache.load('binance:futures:BTCUSDT:1m:200', async () => {
    calls++;
    return [4, 5];
  }), [4, 5]);
  assert.equal(calls, 2);
});

test('a cleared pending flight cannot erase a newer response for the same key', async () => {
  const cache = createTimedRequestCache<number[]>(2_000);
  let finishOld!: (result: number[]) => void;
  const oldTask = cache.load('k', () => new Promise<number[]>(resolve => { finishOld = resolve; }));
  await Promise.resolve();
  cache.clear();
  const current = cache.load('k', async () => [42]);
  assert.deepEqual(await current, [42]);
  finishOld([1]);
  assert.deepEqual(await oldTask, [1]);
  assert.strictEqual(cache.load('k', async () => [0]), current);
});

test('analysis requests normalize pair punctuation without mixing exchange or market', () => {
  assert.equal(normalizeExchangeSymbol('BTC/USDT'), normalizeExchangeSymbol('BTCUSDT'));
  assert.equal(normalizeExchangeSymbol('币安人生/USDT'), normalizeExchangeSymbol('币安人生USDT'));
  const source = readFileSync(new URL('../src/utils/sharedAnalysisKlines.ts', import.meta.url), 'utf8');
  assert.match(source, /const normalizedSymbol = normalizeExchangeSymbol\(symbol\)/);
  assert.match(source, /\[exchange, marketType, normalizedSymbol, timeframe, limit\]/);
  assert.match(source, /fetchDirectKlines\(exchange, marketType, normalizedSymbol, timeframe, limit\)/);
});
