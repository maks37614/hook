import assert from 'node:assert/strict';
import test from 'node:test';
import type { Kline } from '../src/types';
import { calculateBtcCorrelation } from '../src/utils/btcCorrelation';

const tf = 900;
const now = 1_800_000_000;
const last = Math.floor(now / tf) * tf - tf;
const synthetic = (direction: 1 | -1, count = 100): Kline[] => {
  let close = 100;
  return Array.from({ length: count }, (_, index) => {
    if (index) close *= Math.exp(direction * (0.005 * Math.sin(index * 0.7) + 0.002 * Math.cos(index * 1.4)));
    return { time: last - (count - 1 - index) * tf, open: close, high: close, low: close, close, volume: 1 };
  });
};

test('correlation uses real aligned close-to-close returns: positive and negative', () => {
  const btc = synthetic(1);
  const positive = calculateBtcCorrelation(synthetic(1), btc, '15m', now);
  const negative = calculateBtcCorrelation(synthetic(-1), btc, '15m', now);
  assert.equal(positive?.samples, 80);
  assert.ok(positive && positive.value > 0.999);
  assert.ok(negative && negative.value < -0.999);
});

test('in-progress candle cannot change the correlation', () => {
  const btc = synthetic(1);
  const asset = synthetic(-1);
  const baseline = calculateBtcCorrelation(asset, btc, '15m', now);
  asset.push({ ...asset.at(-1)!, time: last + tf, close: 999999 });
  btc.push({ ...btc.at(-1)!, time: last + tf, close: 0.000001 });
  assert.deepEqual(calculateBtcCorrelation(asset, btc, '15m', now), baseline);
});

test('missing candles are not bridged into false multi-candle returns', () => {
  const btc = synthetic(1);
  const asset = synthetic(1).filter((_, index) => index !== 65);
  const result = calculateBtcCorrelation(asset, btc, '15m', now);
  assert.ok(result && result.value > 0.999);
  assert.equal(result.samples, 80);
});

test('returns no result for too few, stale or flat candles', () => {
  const btc = synthetic(1);
  assert.equal(calculateBtcCorrelation(synthetic(1, 20), btc, '15m', now), null);
  assert.equal(calculateBtcCorrelation(synthetic(1).slice(0, 90), btc, '15m', now), null);
  const flat = btc.map((c) => ({ ...c, close: 100 }));
  assert.equal(calculateBtcCorrelation(flat, btc, '15m', now), null);
});
