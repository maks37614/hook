import test from 'node:test';
import assert from 'node:assert/strict';
import { chartMarketStatistics, atr, type Candle } from '../src/components/hookchart/marketAnalytics';
import { calculateBtcCorrelation } from '../src/utils/chartCorrelation';

const candle = (t: number, i: number): Candle => {
  const c = 100 + i * .07 + Math.sin(i / 7) * 2;
  return { t, o: c - .25, h: c + 1, l: c - 2, c, v: 5 + (i % 9), n: i % 11 };
};
const oldStats = (candles: Candle[], period = 14) => {
  const last = candles.at(-1);
  if (!last) return { vol24: 0, high: 0, low: 0, natr: NaN };
  const day = candles.filter(row => row.t >= last.t - 86_400_000);
  return {
    vol24: day.reduce((sum, row) => sum + (row.v || 0) * row.c, 0),
    high: day.length ? Math.max(...day.map(row => row.h)) : last.h,
    low: day.length ? Math.min(...day.map(row => row.l)) : last.l,
    natr: last.c > 0 ? atr(candles, Math.max(2, period || 14)) / last.c * 100 : NaN,
  };
};

test('indexed chart 24h stats preserve historical values with gaps and boundary candles', () => {
  const start = 1_800_000_000_000;
  const all = Array.from({ length: 5000 }, (_, i) => candle(start + i * 60_000, i));
  for (const rows of [
    [] as Candle[], all.slice(0, 1), all.slice(0, 90), all,
    all.filter((_, i) => i % 9 !== 0),
  ]) {
    for (const period of [undefined, 2, 14, 50]) {
      const actual = chartMarketStatistics(rows, period);
      const expected = oldStats(rows, period);
      assert.deepEqual(actual, expected);
    }
  }
});

test('BTC correlation on the relevant 500 candles equals full 5000-bar analysis', () => {
  const timeframeMs = 300_000;
  const startSeconds = 1_800_000_000;
  const alt = Array.from({ length: 5000 }, (_, i) => ({
    time: startSeconds + i * 300,
    close: 90 + i * .04 + Math.sin(i / 7) * 5 + Math.cos(i / 17),
  }));
  const btc = alt.slice(-250).map((row, i) => ({
    time: row.time,
    close: 200 + i * .09 + Math.sin(i / 11) * 6,
  }));
  const now = (alt.at(-1)!.time + 600) * 1000;
  const full = calculateBtcCorrelation(alt, btc, timeframeMs, now);
  const bounded = calculateBtcCorrelation(alt.slice(-500), btc, timeframeMs, now);
  assert.ok(full);
  assert.deepEqual(bounded, full);
});
