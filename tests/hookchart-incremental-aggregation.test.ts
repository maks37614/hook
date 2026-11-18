import test from 'node:test';
import assert from 'node:assert/strict';
import type { Candle } from '../src/components/hookchart/engine';
import {
  aggregateHookChartCandles, updateHookChartAggregation,
} from '../src/components/hookchart/aggregationCache';

const mk = (t: number, i: number): Candle => ({
  t, o: 80 + i / 13, h: 82 + i / 13, l: 79 + i / 13,
  c: 81 + i / 13, v: 3 + i % 7, n: i % 11,
  tb: i % 5 === 0 ? i / 3 : undefined,
});

// The old HookChart algorithm, retained independently here to catch
// regressions in OHLC, volume, trades and taker-buy aggregation.
const reference = (source: Candle[], targetMs: number): Candle[] => {
  const out: Candle[] = [];
  let current: Candle | null = null;
  let bucket = -1;
  for (const candle of source) {
    const nextBucket = Math.floor(candle.t / targetMs) * targetMs;
    if (!current || nextBucket !== bucket) {
      if (current) out.push(current);
      bucket = nextBucket;
      current = { ...candle, t: nextBucket };
    } else {
      current.h = Math.max(current.h, candle.h);
      current.l = Math.min(current.l, candle.l);
      current.c = candle.c;
      current.v += candle.v || 0;
      current.n += candle.n || 0;
      current.tb = (current.tb || 0) + (candle.tb || 0);
    }
  }
  if (current) out.push(current);
  return out;
};

test('live aggregation matches original full aggregation for every price tick and closed candle', () => {
  const start = 1_800_000_000_000;
  for (const [targetTf, targetMs] of [
    ['5m', 300_000], ['15m', 900_000], ['1h', 3_600_000], ['4h', 14_400_000],
  ] as const) {
    let rows: Candle[] = Array.from({ length: 150 }, (_, i) => mk(start + i * 60_000, i));
    let prev = updateHookChartAggregation(rows, '1m', targetTf);
    assert.deepEqual(prev.candles, reference(rows, targetMs));
    for (let i = 150; i < 370; i++) {
      // Trading ticks may decrease last high/volume when the stream corrects
      // an unfinished bar, so do not try to subtract its previous contribution.
      const last = rows.at(-1)!;
      rows = [...rows.slice(0, -1), {
        ...last, h: last.h + (i % 3), l: last.l + (i % 5),
        v: i % 7, n: i % 6, c: last.o + (i % 9), tb: i % 4 ? 0 : i / 2,
      }];
      const replaced = updateHookChartAggregation(rows, '1m', targetTf, prev);
      assert.deepEqual(replaced.candles, reference(rows, targetMs));
      assert.equal(replaced.candles.length, prev.candles.length);
      if (replaced.candles.length > 1)
        assert.strictEqual(replaced.candles[0], prev.candles[0]);
      prev = replaced;

      // Gaps between exchange bars are intentionally not interpolated.
      const nextTime = rows.at(-1)!.t + (i % 23 === 0 ? 12 : 1) * 60_000;
      rows = [...rows, mk(nextTime, i)];
      const appended = updateHookChartAggregation(rows, '1m', targetTf, prev);
      assert.deepEqual(appended.candles, reference(rows, targetMs));
      prev = appended;
    }
  }
});

test('changed history, rewind and timeframe changes trigger full recalculation', () => {
  const base = 1_800_000_000_000;
  const first = Array.from({ length: 70 }, (_, i) => mk(base + i * 60_000, i));
  let prev = updateHookChartAggregation(first, '1m', '15m');
  const sameWrapper = updateHookChartAggregation([...first], '1m', '15m', prev);
  assert.strictEqual(sameWrapper.candles, prev.candles);
  assert.strictEqual(updateHookChartAggregation(first, '1m', '15m', prev), prev);

  const revised = first.map((row, i) => i === 15 ? { ...row, h: row.h + 11 } : row);
  prev = updateHookChartAggregation(revised, '1m', '15m', prev);
  assert.deepEqual(prev.candles, reference(revised, 900_000));
  const rewound = updateHookChartAggregation(revised.slice(0, -10), '1m', '15m', prev);
  assert.deepEqual(rewound.candles, reference(revised.slice(0, -10), 900_000));
  const prepended = [mk(base - 60_000, -1), ...revised];
  assert.deepEqual(updateHookChartAggregation(prepended, '1m', '15m', prev).candles, reference(prepended, 900_000));

  const newTf = updateHookChartAggregation(revised, '1m', '1h', prev);
  assert.deepEqual(newTf.candles, reference(revised, 3_600_000));
  assert.deepEqual(aggregateHookChartCandles(revised, '1m', '1h'), newTf.candles);
});

test('same or unsupported timeframe preserves previous HookChart semantics', () => {
  const c = [mk(1_800_000_000_000, 0)];
  assert.strictEqual(aggregateHookChartCandles(c, '5m', '5m'), c);
  assert.strictEqual(aggregateHookChartCandles(c, '5m', '1m').length, 0);
  assert.strictEqual(aggregateHookChartCandles(c, 'n/a', '15m').length, 0);
  assert.strictEqual(updateHookChartAggregation(c, '1m', '1m').candles, c);
  assert.deepEqual(aggregateHookChartCandles([], '1m', '5m'), []);
});
