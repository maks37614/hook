import test from 'node:test';
import assert from 'node:assert/strict';
import type { SurveillanceConfig, SurveillanceState } from '../src/types';
import { SharedSurveillanceStateCache, type SurveillanceCandles } from
  '../server/surveillance/sharedSurveillanceState';

const config = (patch: Record<string, unknown> = {}) => ({
  momentumTf: '15m', momentumBars: 3, cooldownMinutes: 15, ...patch,
} as SurveillanceConfig);
const candles = (price = 100): SurveillanceCandles => {
  const row = { time: 900_000, open: price, high: price + 1,
    low: price - 1, close: price, volume: 100 };
  return { '1d': [row], '4h': [row], '1h': [row], '15m': [row] } as SurveillanceCandles;
};
const state = (price = 100) => ({ currentPrice: price } as SurveillanceState);

test('shared surveillance calculations run once for identical public market snapshots', async () => {
  const cache = new SharedSurveillanceStateCache(5_000, 16);
  const source = candles();
  let calculations = 0;
  const calculate = async () => { calculations++; return state(); };
  const one = cache.get('binance', 'futures', 'BTCUSDT', config(), source, calculate, 1_000_000);
  const two = cache.get('binance', 'futures', 'BTCUSDT',
    config({ cooldownMinutes: 60 }), source, calculate, 1_000_000);
  assert.strictEqual(one, two, 'concurrent accounts share one in-flight calculation');
  await Promise.all([one, two]);
  assert.equal(calculations, 1);
  assert.deepEqual(cache.stats(), { entries: 1, hits: 1, misses: 1, failures: 0 });
});

test('instrument, market, momentum lookback, candles and bar boundary invalidate reuse', async () => {
  const cache = new SharedSurveillanceStateCache(60_000, 16);
  const base = candles();
  let count = 0;
  const compute = async () => { count++; return state(count); };
  const get = (symbol: string, market: 'spot' | 'futures',
    mode: SurveillanceConfig, bars: SurveillanceCandles, now: number) =>
    cache.get('binance', market, symbol, mode, bars, compute, now);
  await get('BTCUSDT', 'futures', config(), base, 899_000);
  await get('BTCUSDT', 'futures', config({ momentumBars: 4 }), base, 899_000);
  await get('BTCUSDT', 'spot', config(), base, 899_000);
  await get('ETHUSDT', 'futures', config(), base, 899_000);
  await get('BTCUSDT', 'futures', config(), candles(101), 899_000);
  await get('BTCUSDT', 'futures', config(), candles(101), 900_000);
  assert.equal(count, 6);
});

test('failed calculations are retried; cache memory is capped and entries expire', async () => {
  const cache = new SharedSurveillanceStateCache(100, 1);
  let calls = 0;
  const fail = () => { calls++; return Promise.reject(new Error('market unavailable')); };
  await assert.rejects(cache.get('binance', 'spot', 'BTCUSDT', config(), candles(), fail, 1000));
  assert.equal(cache.stats().entries, 0);
  const calc = async () => { calls++; return state(); };
  await cache.get('binance', 'spot', 'BTCUSDT', config(), candles(), calc, 1001);
  await cache.get('binance', 'spot', 'BTCUSDT', config(), candles(), calc, 1102);
  await cache.get('bybit', 'spot', 'ETHUSDT', config(), candles(), calc, 1103);
  assert.equal(cache.stats().entries, 1);
  assert.equal(calls, 4);
  assert.equal(cache.stats().failures, 1);
});
