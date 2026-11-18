import test from 'node:test';
import assert from 'node:assert/strict';
import type { Kline } from '../src/types';
import { contextSnapshot } from '../src/utils/terminalAnalysis/context';
import { scanContextScenarios } from '../src/utils/terminalAnalysis/scenarios';
import type { ChartEvidence, ScenarioId } from '../src/utils/terminalAnalysis/model';

const base = 1_800_000_000;
const empty: ChartEvidence = { manualLevels: [], densityEnabled: false, densities: [], oi: [] };
function bar(i: number, close = 100, seconds = 300): Kline {
  return { time: base + i * seconds, open: close, close, high: close + .5, low: close - .5, volume: 100 };
}
function range(upper = 120, close = 100, count = 40) {
  const rows = Array.from({ length: count }, (_, i) => bar(i, close));
  rows[2].high = upper; rows[5].low = 90;
  return rows;
}
function scan(rows: Kline[], live: Kline, options: { evidence?: ChartEvidence; fast?: Kline[]; fastLive?: Kline } = {}) {
  const snapshot = contextSnapshot(rows); assert.ok(snapshot);
  return scanContextScenarios({ snapshot, live, at: (live.time + 1) * 1000,
    evidence: options.evidence || empty, fast: options.fast || [], fastLive: options.fastLive });
}
function expect(scenario: ScenarioId, rows: Kline[], live: Kline, options: Parameters<typeof scan>[2] = {}) {
  const found = scan(rows, live, options);
  assert.ok(found.some(s => s.scenario === scenario), scenario + ': got ' + found.map(s => s.scenario).join(', '));
  return found.find(s => s.scenario === scenario)!;
}

test('Z4 cascade is an ordered three-extreme staircase approached at the first reachable level', () => {
  const rows = range(); rows[12].high = 101; rows[23].high = 102; rows[33].high = 103;
  const live = { ...bar(40, 100.95), high: 101, low: 100 };
  const found = expect('z4_cascade', rows, live);
  assert.equal(found.level, 101); assert.equal(found.zone, 4);
  rows[23].high = 105;
  assert.ok(!scan(rows, live).some(s => s.scenario === 'z4_cascade'));
});

test('Z4 large line uses at least three separated wick contacts', () => {
  const rows = range(120, 95);
  for (const i of [10, 20, 30]) rows[i].high = 110 - i * .1;
  const live = { ...bar(40, 105.95), high: 106, low: 105.8 };
  expect('z4_line', rows, live);
  rows[20].high -= 2;
  assert.ok(!scan(rows, live).some(s => s.scenario === 'z4_line'));
});

test('Z4 reverse breakout requires actual user marks and never promises a direction', () => {
  const rows = range(); rows[20].low = 99; rows[30].low = 99;
  const live = { ...bar(40, 99.05), high: 100, low: 99 };
  assert.ok(!scan(rows, live).some(s => s.scenario === 'z4_reverse'));
  const found = expect('z4_reverse', rows, live, { evidence: { ...empty, manualLevels: [118] } });
  assert.equal(found.side, 'neutral');
  rows.forEach(b => { b.volume = 0; });
  assert.ok(!scan(rows, live, { evidence: { ...empty, manualLevels: [118] } }).some(s => s.scenario === 'z4_reverse'));
});

test('Z4 trendline starts at the rejected lower high, not at its final lower touch', () => {
  const rows = range(110, 100, 60);
  rows[15].high = 109; rows[25].high = 108; rows[35].high = 107;
  const live = { ...bar(60, 104.45), high: 104.5, low: 104 };
  expect('z4_trend', rows, live);
});

test('Z3 local pullback returns within 10–20m and targets the local high, not the main wall', () => {
  const rows = range(110, 107); rows[37].high = 109;
  rows[38] = { ...bar(38, 108), low: 107.5 }; rows[39] = { ...bar(39, 108.4), low: 108 };
  const found = expect('z3_local', rows, { ...bar(40, 108.95), high: 109, low: 108.6 });
  assert.equal(found.level, 109); assert.equal(found.mainLevel, 110); assert.equal(found.triggerTf, '5m');
});

test('Z3 two-contact slope is valid near the main level but not a substitute for a three-touch range line', () => {
  const rows = range(110, 107); rows[25].high = 109.5; rows[33].high = 109.2;
  const signals = scan(rows, { ...bar(40, 108.9), high: 109, low: 108.6 });
  assert.ok(signals.some(s => s.scenario === 'z3_line'));
  assert.ok(!signals.some(s => s.scenario === 'z4_line'));
});

test('a wick re-break requires 2–3 real minutes of retreat, not repeated sawing through the line', () => {
  const rows = range(110, 107); rows[25].high = 109.5; rows[33].high = 109.2;
  const live = { ...bar(40, 109.35), high: 109.4, low: 108.6 };
  const fast = Array.from({ length: 20 }, (_, i) => bar(180 + i, 108.5, 60));
  fast[17] = { ...fast[17], high: 109.3, close: 108.5, low: 108.4 };
  fast[18] = { ...fast[18], high: 108.65, low: 108.3, close: 108.5 };
  fast[19] = { ...fast[19], high: 108.7, low: 108.3, close: 108.5 };
  const fastLive = { ...bar(200, 109.35, 60), high: 109.4, low: 108.5 };
  const signals = scan(rows, live, { fast, fastLive });
  assert.ok(signals.some(s => s.scenario === 'z3_line' && s.confirmation === 'wick_rebreak' && s.level === 109.3));
  fast[18].high = 109.4;
  assert.ok(!scan(rows, live, { fast, fastLive }).some(s => s.confirmation === 'wick_rebreak'));
});

test('Z3 consolidation requires clear repeat boundaries rather than a single pause', () => {
  const rows = range(110, 107);
  for (let i = 32; i < 40; i++) rows[i] = { ...bar(i, 108.6), high: 109, low: 108.2 };
  expect('z3_range', rows, { ...bar(40, 108.98), high: 109, low: 108.8 });
});

test('Z3 range and distance setups confirm the watched level, including when the breakout wick sets a new high', () => {
  const rows = range(110, 102);
  for (let i = 32; i < 40; i++) rows[i] = { ...bar(i, 108.6), high: 109, low: 108.2 };
  const approach = { ...bar(40, 108.98), high: 109, low: 108.8 };
  const breakout = { ...bar(40, 109.55), open: 108.98, high: 109.65, low: 108.8 };
  const next = { ...bar(41, 109.60), high: 109.65, low: 109.50 };
  for (const scenario of ['z3_range', 'z3_distance'] as const) {
    const watch = expect(scenario, rows, approach);
    const confirmed = expect(scenario, [...rows, breakout], next);
    assert.equal(watch.stage, 'watch'); assert.equal(watch.level, 109);
    assert.equal(confirmed.key, watch.key);
    assert.equal(confirmed.stage, 'confirmed'); assert.equal(confirmed.confirmation, 'close');
    assert.equal(confirmed.level, watch.level);
    const wickOnly = { ...breakout, close: 108.98 };
    assert.ok(!scan([...rows, wickOnly], next).some(n => n.scenario === scenario && n.stage === 'confirmed'));
  }
});

test('Z3 failed level requires rejection followed by a CLOSED break of the rising support', () => {
  const rows = range(110, 109);
  rows[15].low = 106; rows[25].low = 107; rows[35].low = 108;
  rows[37].high = 110; rows[38].high = 110;
  rows[39] = { ...bar(39, 107.8), high: 109, low: 107.5 };
  const live = { ...bar(40, 107.7), high: 108, low: 107.5 };
  const signal = expect('z3_reject', rows, live);
  assert.equal(signal.stage, 'confirmed');
  rows[39].close = 109;
  assert.ok(!scan(rows, live).some(s => s.scenario === 'z3_reject'));
});

test('Z3 approach from a distance has no entry event until a real base exists', () => {
  const rows = range(110, 102);
  for (let i = 32; i < 40; i++) rows[i] = { ...bar(i, 108.6), high: 109, low: 108.2 };
  const live = { ...bar(40, 108.98), high: 109, low: 108.8 };
  expect('z3_distance', rows, live);
  for (let i = 32; i < 40; i++) rows[i] = bar(i, 104 + (i - 32) * .6);
  assert.ok(!scan(rows, live).some(s => s.scenario === 'z3_distance'));
});

test('first higher-high setup permits THREE impulse bars and a single red correction candle', () => {
  const rows = range(110, 100), fast = Array.from({ length: 32 }, (_, i) => bar(168 + i, 109, 60));
  const prices = [[109, 112], [112, 115], [115, 118], [118, 117.7]];
  prices.forEach(([open, close], i) => { const index = fast.length - 4 + i;
    fast[index] = { ...fast[index], open, close, high: Math.max(open, close) + .1, low: Math.min(open, close) - .1 }; });
  const live = { ...bar(40, 118), high: 118.2, low: 117.6 };
  const fastLive = { ...bar(200, 118.05, 60), high: 118.1, low: 117.7 };
  expect('z1_first', rows, live, { fast, fastLive });
  fast.at(-1)!.low = 110; fast.at(-1)!.close = 110.1;
  assert.ok(!scan(rows, live, { fast, fastLive }).some(s => s.scenario === 'z1_first'));
});

test('post-breakout continuation keeps its origin: a genuine prior break and an unbroken base', () => {
  const rows = range(110, 100);
  rows[39] = { ...bar(39, 111), open: 109, high: 111.5, low: 108.5 };
  const fast = Array.from({ length: 32 }, (_, i) => bar(168 + i, 111.8, 60));
  for (let i = 24; i < 32; i++) fast[i] = { ...fast[i], high: 112.3, low: 111.5, close: 112 };
  const live = { ...bar(40, 112.28), high: 112.3, low: 111.8 };
  const watch = expect('z1_continue', rows, live, { fast, fastLive: { ...bar(200, 112.28, 60), high: 112.3, low: 112 } });
  const breakout = { ...bar(200, 112.9, 60), open: 112, high: 113.1, low: 111.9 };
  const fastLive = bar(201, 112.9, 60);
  const snapshot = contextSnapshot(rows)!;
  const result = scanContextScenarios({ snapshot, live: { ...live, high: 113.1, close: 112.9 },
    at: (fastLive.time + 1) * 1000, fast: [...fast, breakout], fastLive, evidence: empty });
  const confirmed = result.find(n => n.key === watch.key && n.stage === 'confirmed');
  assert.equal(confirmed?.level, 112.3);
  assert.equal(confirmed?.triggerAt, (breakout.time + 60) * 1000);
  rows[39] = bar(39, 100);
  assert.ok(!scan(rows, live, { fast, fastLive: bar(200, 112.28, 60) }).some(s => s.scenario === 'z1_continue'));
});

test('Temka variants hold the local low for 4–5m; prior-high context separates them', () => {
  const fast = Array.from({ length: 32 }, (_, i) => bar(168 + i, 100, 60));
  fast[25] = { ...fast[25], open: 100, close: 120, high: 121, low: 99.8 };
  fast[26] = { ...fast[26], open: 120, close: 140, high: 141, low: 119.8 };
  for (let i = 27; i < 32; i++) fast[i] = { ...fast[i], open: 140, close: 140, high: 140.5, low: 139.5 };
  const live = { ...bar(40, 140), high: 140.5, low: 139.5 }, fastLive = { ...bar(200, 140, 60), high: 140.5, low: 139.6 };
  const one = expect('temka1', range(110), live, { fast, fastLive });
  assert.equal(one.level, 139.5); assert.equal(one.stage, 'watch');
  const two = expect('temka2', range(141), live, { fast, fastLive });
  assert.equal(two.zone, 2);
  assert.ok(!scan(range(160), live, { fast, fastLive }).some(s => s.scenario === 'temka2'), 'a distant unrelated old high is not Temka 2');
});

test('pump, dump and gradual post-pump decline are different context families', () => {
  const pump = range(120, 100, 52);
  for (let i = 42; i < 52; i++) pump[i] = bar(i, 102 + (i - 42) * 5);
  assert.equal(contextSnapshot(pump)!.context.regime, 'pump');
  expect('pump', pump, bar(52, 149));
  const dump = range(120, 100, 52);
  for (let i = 42; i < 52; i++) dump[i] = bar(i, 100 - (i - 42) * 3);
  assert.equal(contextSnapshot(dump)!.context.regime, 'dump');
  expect('dump', dump, bar(52, 72));
  const post = range(120, 100, 52);
  for (let i = 15; i <= 24; i++) post[i] = bar(i, 100 + (i - 15) * 7);
  for (let i = 25; i < 52; i++) post[i] = bar(i, 150 - (i - 25) * .7);
  post[28].high = 157; post[38].high = 147; post[48].high = 137;
  assert.equal(contextSnapshot(post)!.context.regime, 'post_pump');
  expect('post_pump', post, { ...bar(52, 132.95), high: 133, low: 132.7 });
});
