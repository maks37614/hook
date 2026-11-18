import assert from 'node:assert/strict';
import test from 'node:test';
import type { Candle } from '../src/components/hookchart/engine';
import { createChartDayOverlayCalculator } from '../src/components/hookchart/chartDayOverlays';
import { createSupportResistanceCalculator } from '../src/components/hookchart/supportResistance';
import { hookChartHorizontalRange, resizeHookChartViewport } from '../src/utils/hookchartData';

const hour = 60 * 60 * 1000;
const candle = (t: number, c = 100, v = 123) =>
  ({ t, o: c - 1, h: c + 5, l: c - 4, c, v, n: 8 });

test('VWAP and daily levels stay exact through midnight, DST, backfills, rewind and timezone changes', () => {
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format;
  const options = { previousDay: true, dayOpen: true, vwap: true };
  let keyCalls = 0;
  const calculate = createChartDayOverlayCalculator(t => {
    keyCalls++;
    return dateKey(t);
  }, options);
  const start = Date.UTC(2026, 9, 24);
  const rows = Array.from({ length: 44 }, (_, index) => candle(start + index * hour, 100 + index, index % 4));
  const initial = calculate(rows);
  assert.equal(initial.prev?.t, start);
  assert.equal(initial.dayOpen?.t, start + 22 * hour);
  assert.equal(initial.vwap.length, 22);

  const revised = [...rows.slice(0, -1), candle(rows.at(-1)!.t, 195, 17)];
  keyCalls = 0;
  const revisedResult = calculate(revised);
  assert.equal(keyCalls, 1, 'a forming candle does not rescan the day');
  assert.strictEqual(revisedResult.vwap[20], initial.vwap[20]);
  const appends = [...revised, candle(start + 44 * hour, 121), candle(start + 45 * hour, 142)];
  const corrected = appends.map((row, index) => index === 43 ? candle(row.t, 200, 100) : row);
  const rewind = corrected.slice(0, 17);
  const sequences = [revised, appends.slice(0, -1), appends, corrected, rewind, []];
  for (const length of [46, 47, 48, 49, 50]) {
    sequences.push(Array.from({ length }, (_, i) => corrected[i] ?? candle(start + i * hour)));
  }
  for (const series of sequences) {
    // Reference is an independent full recomputation for each input.
    const last = series.at(-1);
    const today = last ? series.filter(row => dateKey(row.t) === dateKey(last.t)) : [];
    const priorEnd = series[series.length - today.length - 1];
    const prior = priorEnd ? series.filter(row => dateKey(row.t) === dateKey(priorEnd.t)) : [];
    let weighted = 0;
    let volume = 0;
    const vwap = today.map(({ t, h, l, c, v }) => {
      weighted += ((h + l + c) / 3) * v;
      volume += v;
      return { t, p: volume ? weighted / volume : c };
    });
    assert.deepEqual(calculate(series), {
      prev: prior.length ? { h: Math.max(...prior.map(row => row.h)), l: Math.min(...prior.map(row => row.l)), t: prior[0].t } : null,
      dayOpen: today.length ? { p: today[0].o, t: today[0].t } : null,
      vwap,
    });
  }
  const utc = createChartDayOverlayCalculator(t => new Date(t).toISOString().slice(0, 10), options);
  assert.equal(utc(rows).dayOpen?.t, start + 24 * hour);
});

test('support and resistance use exact closed wick prices and react to changes in the forming candle', () => {
  const rows: Candle[] = Array.from({ length: 24 }, (_, i) => candle(i * hour));
  rows[7] = { ...rows[7], h: 118 };
  rows[10] = { ...rows[10], l: 89 };
  const calculate = createSupportResistanceCalculator('1m');
  const initial = calculate(rows);
  assert.deepEqual(initial.map(row => row.p), [118, 89]);
  const liveBreak = [...rows.slice(0, -1), candle(rows.at(-1)!.t, 120)];
  assert.deepEqual(calculate(liveBreak).map(row => row.p), [89]);
  const liveReturn = [...rows.slice(0, -1), { ...rows.at(-1)!, h: 135, l: 88 }];
  assert.deepEqual(calculate(liveReturn), initial);

  const historicalBreak = rows.map((row, i) => i === 16 || i === 17 ? candle(row.t, 120) : row);
  assert.ok(!calculate(historicalBreak).some(row => row.p === 118));
  assert.deepEqual(calculate(rows), initial, 'corrected history must invalidate cached pivots');
});

test('compact wheel zoom and Fit All transitions preserve the candle beneath the pointer', () => {
  const count = 1200;
  const width = 322;
  const bars = 16;
  const paddingPixels = 12;
  const anchor = 127;
  for (const view of [
    { barWidth: 2.07, rightOffset: 43 },
    { barWidth: 9, rightOffset: 14, fitAll: true },
  ]) {
    const factor = Math.exp(.036);
    const before = hookChartHorizontalRange(count, width, view, bars, paddingPixels);
    const adjusted = resizeHookChartViewport(count, width, view, factor, anchor, bars, paddingPixels);
    const after = hookChartHorizontalRange(count, width, adjusted, bars, paddingPixels);
    assert.ok(Math.abs(adjusted.barWidth - before.step * factor) < 1e-9);
    assert.ok(Math.abs(before.virtualStart + anchor / before.step - after.virtualStart - anchor / after.step) < 1e-8);
  }
});
