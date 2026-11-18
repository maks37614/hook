import assert from 'node:assert/strict';
import test from 'node:test';
import { cmfSeries, vrSeries, type IndicatorCandle } from '../src/components/hookchart/indicatorEngine';

const history: IndicatorCandle[] = Array.from({ length: 1200 }, (_, i) => {
  const close = 50 + Math.sin(i * .17) * 4 + i * .013;
  return {
    t: 1700000000000 + 60000 * i,
    o: close - .17, h: close + .9 + i % 5 * .05, l: close - 1.2,
    c: close, v: i % 47 === 0 ? 0 : 20 + i % 43 * 137,
    n: i % 40,
  };
});

function previousCmf(c: IndicatorCandle[], period: number) {
  const mfv = c.map(z => { const r = z.h - z.l; return r ? (((z.c - z.l) - (z.h - z.c)) / r) * z.v : 0; });
  return c.map((_, i) => {
    const start = Math.max(0, i - period + 1);
    const vol = c.slice(start, i + 1).reduce((sum, row) => sum + row.v, 0);
    const flow = mfv.slice(start, i + 1).reduce((sum, amount) => sum + amount, 0);
    return vol ? flow / vol : 0;
  });
}

function previousVr(c: IndicatorCandle[], period: number) {
  return c.map((row, i) => {
    const base = c.slice(Math.max(0, i - period), i).map(z => z.v);
    const average = base.length ? base.reduce((sum, v) => sum + v, 0) / base.length : 0;
    return average ? row.v / average : 1;
  });
}

function assertSeriesUnchanged(actual: number[], expected: number[]) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) {
    const tolerance = Math.max(1e-10, Math.abs(expected[i]) * 1e-10);
    assert.ok(Math.abs(actual[i] - expected[i]) <= tolerance,
      `indicator drift at bar ${i}: ${actual[i]} vs ${expected[i]}`);
  }
}

test('CMF rolling sums match previous exact-window implementation', () => {
  for (const length of [0, 1, 9, 40, 1200]) {
    const candles = history.slice(0, length);
    for (const period of [0, 1, 3, 14, 20, 55, 1000]) {
      assertSeriesUnchanged(cmfSeries(candles, period), previousCmf(candles, period));
    }
  }
});

test('VR rolling baseline excludes the current candle and matches previous values', () => {
  for (const length of [0, 1, 9, 40, 1200]) {
    const candles = history.slice(0, length);
    for (const period of [0, 1, 3, 14, 20, 55, 1000]) {
      assertSeriesUnchanged(vrSeries(candles, period), previousVr(candles, period));
    }
  }
});

test('zero-volume candles remain safe and do not create an artificial ratio', () => {
  const emptyVolume = history.slice(0, 100).map(c => ({ ...c, v: 0 }));
  assert.deepEqual(cmfSeries(emptyVolume), new Array(emptyVolume.length).fill(0));
  assert.deepEqual(vrSeries(emptyVolume), new Array(emptyVolume.length).fill(1));
});
