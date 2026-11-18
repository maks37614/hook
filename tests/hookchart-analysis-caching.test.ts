import test from 'node:test';
import assert from 'node:assert/strict';
import type { Candle } from '../src/components/hookchart/engine';
import type { Kline } from '../src/types';
import { toHookCandles } from '../src/utils/hookchartData';
import { sharedAnalysisHookCandles } from '../src/utils/sharedAnalysisCandles';
import { deriveAutoLevels, memoizedAutoLevels } from '../src/components/hookchart/marketAnalytics';

const mk = (i: number): Candle => {
  const c = 100 + Math.sin(i / 8) * 5 + Math.cos(i / 21) * 2;
  return { t: 1_800_000_000_000 + i * 300_000, o: c - .3, h: c + 1, l: c - 1, c, v: 100, n: 12 };
};

test('remote immutable analysis Klines are converted once for several Terminal charts', () => {
  const source: Kline[] = Array.from({ length: 130 }, (_, i) => ({
    time: 1_800_000_000 + i * 300,
    open: 80 + i / 10, high: 82 + i / 10, low: 79 + i / 10,
    close: 81 + i / 10, volume: 25,
  }));
  const first = sharedAnalysisHookCandles(source);
  assert.strictEqual(sharedAnalysisHookCandles(source), first);
  assert.deepEqual(first, toHookCandles(source));
  const revised = source.map((row, i) => i === 129 ? { ...row, close: row.close + 1 } : row);
  const updated = sharedAnalysisHookCandles(revised);
  assert.notStrictEqual(updated, first);
  assert.equal(updated.at(-1)!.c, first.at(-1)!.c + 1);
});

test('structural level caching is equal to exact original algorithm, but scoped to history and settings', () => {
  const candles = Array.from({ length: 430 }, (_, i) => mk(i));
  const settings = {
    count: 2, allowedDiffPct: .3, historyDepth: 300,
    breakPct: .4, pivotBars: 12, allowWickPenetration: true,
  };
  const original = deriveAutoLevels(candles, '5m', settings);
  const calculated = memoizedAutoLevels(candles, '5m', settings);
  assert.deepEqual(calculated, original);
  assert.strictEqual(memoizedAutoLevels(candles, '5m', { ...settings }), calculated);

  const changedSettings = memoizedAutoLevels(candles, '5m', { ...settings, breakPct: .6 });
  assert.deepEqual(changedSettings, deriveAutoLevels(candles, '5m', { ...settings, breakPct: .6 }));
  assert.notStrictEqual(changedSettings, calculated);
  const otherTimeframe = memoizedAutoLevels(candles, '15m', settings);
  assert.notStrictEqual(otherTimeframe, calculated);
  assert.deepEqual(otherTimeframe, deriveAutoLevels(candles, '15m', settings));

  const correctedHistory = candles.map((row, i) => i === 400 ? { ...row, h: row.h + 20 } : row);
  const refreshed = memoizedAutoLevels(correctedHistory, '5m', settings);
  assert.notStrictEqual(refreshed, calculated);
  assert.deepEqual(refreshed, deriveAutoLevels(correctedHistory, '5m', settings));
});

test('per-series cache bounds the number of remembered preference combinations', () => {
  const candles = Array.from({ length: 100 }, (_, i) => mk(i));
  const initial = memoizedAutoLevels(candles, '5m', { count: 1 });
  for (let i = 0; i < 30; i++) {
    const config = { count: 1, breakPct: .1 + i * .001 };
    assert.deepEqual(memoizedAutoLevels(candles, '5m', config), deriveAutoLevels(candles, '5m', config));
  }
  const afterEviction = memoizedAutoLevels(candles, '5m', { count: 1 });
  assert.notStrictEqual(afterEviction, initial);
  assert.deepEqual(afterEviction, deriveAutoLevels(candles, '5m', { count: 1 }));
});
