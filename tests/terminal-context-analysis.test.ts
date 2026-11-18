import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import type { Kline } from '../src/types';
import { TerminalContextEngine } from '../src/utils/terminalAnalysis/engine';
import { contextSnapshot } from '../src/utils/terminalAnalysis/context';
import { aggregateClosed, boundedBars, linePrice, validBar, wickLines, wickPivots } from '../src/utils/terminalAnalysis/geometry';
import { scanContextScenarios } from '../src/utils/terminalAnalysis/scenarios';
import { analysisMarketKey, terminalAnalysisAllowed, type ChartEvidence, type ContextNotice } from '../src/utils/terminalAnalysis/model';

const base = 1_800_000_000;
const noEvidence: ChartEvidence = { manualLevels: [], densityEnabled: false, densities: [], oi: [] };
function bar(index: number, close = 105, step = 300): Kline {
  return { time: base + index * step, open: close, high: close + .5, low: close - .5, close, volume: 100 };
}
function range(count = 50): Kline[] {
  return Array.from({ length: count }, (_, i) => bar(i, 105 + Math.sin(i * Math.PI / 5) * 2));
}
function lowReturn(sweep = false, minutes = 95, penetration = .4) {
  const rows = range(100), pivot = 50;
  rows[8].high = 120;
  rows[pivot] = { ...bar(pivot, 102), low: 100 };
  const testIndex = sweep ? pivot + 7 : pivot;
  if (sweep) rows[testIndex] = { ...bar(testIndex, 100.1), high: 102, low: 100 * (1 - penetration / 100) };
  const currentIndex = testIndex + minutes / 5;
  const completed = rows.slice(0, currentIndex);
  const level = sweep ? 100 * (1 - penetration / 100) : 100;
  if (sweep) for (let i = completed.length - 4; i < completed.length; i++)
    completed[i] = { ...bar(i, level + .3), high: level + 1, low: level + .15 };
  const live = { ...bar(currentIndex, level + .15), high: level + .6, low: level };
  const at = (live.time + 5) * 1000;
  return { completed, live, at, level };
}
const scanLow = (fixture: ReturnType<typeof lowReturn>) => {
  const snapshot = contextSnapshot(fixture.completed)!;
  return scanContextScenarios({ snapshot, live: fixture.live, at: fixture.at, fast: [], evidence: noEvidence });
};

test('the configured limit and actual panels independently gate analysis', () => {
  assert.equal(terminalAnalysisAllowed(10, 3), true);
  assert.equal(terminalAnalysisAllowed(11, 3), false);
  assert.equal(terminalAnalysisAllowed(10, 11), false);
  assert.equal(terminalAnalysisAllowed(9, 0), true);
  assert.equal(terminalAnalysisAllowed(NaN, 3), false);
  assert.equal(analysisMarketKey({ exchange: 'bybit', marketType: 'spot', symbol: ' btcusdt ' }), 'bybit:spot:BTCUSDT');
});

test('24h means no earlier, future, invalid or unaligned candles; gaps are never bridged', () => {
  const rows = range(300), now = (rows.at(-1)!.time + 15) * 1000;
  const accepted = boundedBars([...rows, { ...rows[20], high: -1 }, bar(301)], 300, now);
  assert.ok(accepted.every(b => b.time >= now / 1000 - 86400 && b.time <= now / 1000));
  assert.equal(accepted.at(-1)!.time, rows.at(-1)!.time);
  assert.equal(validBar({ ...bar(0), low: 200 }), false);
  const gap = boundedBars([bar(0), bar(1), bar(3), bar(4)], 300, (base + 1300) * 1000);
  assert.deepEqual(gap.map(b => b.time), [bar(3).time, bar(4).time]);
  assert.equal(boundedBars([{ ...bar(0), time: base + 1 }], 300, now).length, 0);
});

test('higher context aggregates only full closed buckets and never fabricates a daily trend', () => {
  const rows = Array.from({ length: 288 }, (_, i) => bar(i, 100 + i * .02));
  assert.equal(aggregateClosed(rows, 3600).length, 24);
  assert.equal(aggregateClosed(rows.slice(1), 3600).length, 23);
  assert.equal(aggregateClosed(rows, 14400).length, 6);
  const context = contextSnapshot(rows)!.context;
  assert.equal(context.dailyTrendAvailable, false);
  assert.equal(context.h1, 'up');
  assert.equal(context.h4, 'up');
  assert.equal(contextSnapshot(rows.slice(-36))!.context.h4, 'unavailable');
});

test('wick pivots are unavailable until both right-side candles have closed', () => {
  const rows = Array.from({ length: 9 }, (_, i) => bar(i, 100));
  rows[5].high = 110;
  assert.ok(!wickPivots(rows.slice(0, 7), 'up').some(p => p.time === rows[5].time));
  assert.ok(wickPivots(rows.slice(0, 8), 'up').some(p => p.price === 110));
  rows[5].close = 100.1;
  assert.equal(wickPivots(rows, 'up').find(p => p.time === rows[5].time)!.price, 110);
});

test('clean large slopes need independent wick anchors and reject an earlier body break', () => {
  const rows = Array.from({ length: 32 }, (_, i) => bar(i, 95 - i * .05));
  for (const i of [5, 14, 23]) rows[i].high = 105 - i * .1;
  const pivots = wickPivots(rows, 'up');
  const lines = wickLines(rows, pivots, 'up', 1, 3);
  assert.ok(lines.length);
  const line = lines[0];
  assert.equal(linePrice(line, line.a.time), rows[line.a.i].high);
  assert.equal(linePrice(line, line.b.time), rows[line.b.i].high);
  rows[18].close = 110; rows[18].high = 111;
  assert.deepEqual(wickLines(rows, pivots, 'up', 1, 3), []);
});

test('Z5 full level requires a real departure and a 1–2h return, with elapsed time', () => {
  const signals = scanLow(lowReturn());
  const found = signals.find(s => s.scenario === 'z5_level');
  assert.ok(found);
  assert.equal(found.returnMinutes, 95);
  assert.equal(found.zone, 5);
  assert.equal(found.triggerTf, '5m');
  assert.ok(!scanLow(lowReturn(false, 45)).some(s => s.scenario === 'z5_level'));
  assert.ok(!scanLow(lowReturn(false, 125)).some(s => s.scenario === 'z5_level'));
  const noTouch = lowReturn(); noTouch.live.low += 2; noTouch.live.close += 2; noTouch.live.high += 2;
  assert.ok(!scanLow(noTouch).some(s => s.scenario === 'z5_level'));
});

test('Z5 sweep requires 0.3–0.5%, an independent bounce and a later compressed return', () => {
  assert.ok(scanLow(lowReturn(true, 90, .4)).some(s => s.scenario === 'z5_sweep'));
  assert.ok(!scanLow(lowReturn(true, 90, .2)).some(s => s.scenario === 'z5_sweep'));
  assert.ok(!scanLow(lowReturn(true, 90, .8)).some(s => s.scenario === 'z5_sweep'));
  assert.ok(!scanLow(lowReturn(true, 45, .4)).some(s => s.scenario === 'z5_sweep'));
  const failed = lowReturn(true, 90, .4);
  failed.completed.at(-2)!.close = 98; failed.completed.at(-2)!.low = 97.9;
  assert.ok(!scanLow(failed).some(s => s.scenario === 'z5_sweep'));
});

test('density evidence is gated, market data is dated and only a coinciding wall is used', () => {
  const f = lowReturn(), snapshot = contextSnapshot(f.completed)!;
  const input = { snapshot, live: f.live, at: f.at, fast: [] };
  const evidence: ChartEvidence = { ...noEvidence, densityEnabled: false,
    densities: [{ price: f.level, side: 'BID', at: f.at, firstAt: f.at - 120000, usd: 500000 }] };
  const find = () => scanContextScenarios({ ...input, evidence }).find(s => s.scenario === 'z5_level')!;
  assert.ok(!find().evidence.includes('density'));
  evidence.densityEnabled = true;
  assert.ok(find().evidence.includes('density'));
  evidence.densities[0].at -= 20000;
  assert.ok(!find().evidence.includes('density'));
  evidence.densities[0].at = f.at; evidence.densities[0].price += 50;
  assert.ok(!find().evidence.includes('density'));
});

test('first observation is current, repeated ticks are quiet and confirmed old history is not re-alerted', () => {
  const f = lowReturn(), engine = new TerminalContextEngine();
  engine.seed('5m', f.completed, f.at - 1);
  const update = (at: number) => engine.update({ type: 'update', scope: 'binance:futures:BTCUSDT',
    candles: { '5m': f.live }, evidence: noEvidence, at });
  assert.ok(update(f.at).notices.some(s => s.scenario === 'z5_level'));
  for (let i = 1; i < 20; i++) assert.deepEqual(update(f.at + i * 1000).notices, []);
  const stale = engine.update({ type: 'update', scope: 'a', candles: {}, evidence: noEvidence, at: f.at + 40000 });
  assert.deepEqual(stale.notices, []);
});

test('bar-by-bar replay gives identical prefix decisions regardless of a future pump suffix', () => {
  const f = lowReturn(), history = f.completed;
  const run = (suffix: Kline[]) => {
    const e = new TerminalContextEngine(), notices: ContextNotice[] = [];
    e.seed('5m', [...history, ...suffix], f.at - 1);
    for (let i = 0; i < 8; i++) notices.push(...e.update({ type: 'update', scope: 'a',
      candles: { '5m': f.live }, evidence: noEvidence, at: f.at + i * 1000 }).notices);
    return notices;
  };
  const future = Array.from({ length: 10 }, (_, i) => bar(80 + i, 200 + i * 50));
  assert.deepEqual(run(future), run([]));
});

test('a context gap and insufficient history suppress unsupported setups', () => {
  const f = lowReturn(), e = new TerminalContextEngine();
  e.seed('5m', f.completed.slice(-20), f.at - 1);
  assert.deepEqual(e.update({ type: 'update', scope: 'a', candles: { '5m': f.live },
    evidence: noEvidence, at: f.at }).notices, []);
});

test('two NEW closed candles can invalidate a watch, while previous candles cannot', () => {
  const f = lowReturn(), e = new TerminalContextEngine(); e.seed('5m', f.completed, f.at - 1);
  const scope = 'binance:futures:BTCUSDT';
  const send = (live: Kline, at: number) => e.update({ type: 'update', scope, candles: { '5m': live }, evidence: noEvidence, at });
  const watch = send(f.live, f.at).notices.find(n => n.scenario === 'z5_level')!;
  assert.ok(watch);
  const changed = { ...f.live, close: 104, high: 104.5 };
  assert.deepEqual(send(changed, f.at + 2000).notices, []);
  const one = { ...changed, time: changed.time + 300, open: 104, low: 103.5 };
  assert.ok(!send(one, f.at + 300000).notices.some(n => n.stage === 'cancelled'));
  const two = { ...one, time: one.time + 300 };
  const result = send(two, f.at + 600000).notices.find(n => n.stage === 'cancelled');
  assert.equal(result?.key, watch.key);
  assert.deepEqual(send(two, f.at + 602000).notices, []);
});

test('behavior observations are split by direction and structure family within the current regime', () => {
  const rows = range(120), snapshot = contextSnapshot(rows)!;
  assert.notEqual(snapshot.behavior.horizontal.up, snapshot.behavior.horizontal.down);
  assert.notEqual(snapshot.behavior.horizontal.up, snapshot.behavior.trendline.up);
  const total = Object.values(snapshot.behavior).flatMap(group => Object.values(group))
    .reduce((sum, sample) => sum + sample.tests, 0);
  assert.equal(total, snapshot.context.priorTests);
  for (const group of Object.values(snapshot.behavior)) for (const count of Object.values(group))
    assert.ok(count.failures <= count.tests);
});

test('an exchange close retained at rollover prevents a false cancellation based on a temporary price', () => {
  const { completed, live, at } = lowReturn();
  const engine = new TerminalContextEngine();
  engine.seed('5m', completed, at - 1);
  const send = (candle: Kline, time: number, final?: Kline) => engine.update({
    type: 'update', scope: 'BTC', at: time, candles: { '5m': candle }, closedCandles: { '5m': final }, evidence: noEvidence,
  }).notices;
  const watch = send(live, at).find(n => n.scenario === 'z5_level')!;
  assert.ok(watch);
  const temporary = { ...live, close: 104, high: 104.5 };
  assert.ok(temporary.close > watch.invalidateLevel);
  assert.ok(live.close < watch.invalidateLevel);
  send(temporary, at + 1000);
  const later = { ...temporary, time: live.time + 300 };
  send(later, at + 300_000, { ...temporary, close: live.close });
  const invalidated = (n: ContextNotice) => n.key === watch.key && n.stage === 'cancelled';
  assert.ok(!send({ ...later, time: later.time + 300 }, at + 600_000).some(invalidated));
  assert.ok(send({ ...later, time: later.time + 600 }, at + 900_000).some(invalidated));
});

test('ten warm markets have bounded worker computation for normal live ticks', t => {
  const engines = Array.from({ length: 10 }, () => new TerminalContextEngine());
  const rows = range(288), live = bar(288, 106), at = (live.time + 1) * 1000;
  engines.forEach(e => e.seed('5m', rows, at - 1));
  const start = performance.now();
  for (let tick = 0; tick < 60; tick++) for (const e of engines)
    e.update({ type: 'update', scope: 'load', candles: { '5m': { ...live, close: 106 + tick * .0001 } }, evidence: noEvidence, at: at + tick * 1000 });
  const ms = performance.now() - start;
  t.diagnostic('10 markets × 60 updates: ' + ms.toFixed(1) + ' ms inside the worker engine');
  assert.ok(ms < 5000, 'warm live updates must remain bounded');
});
