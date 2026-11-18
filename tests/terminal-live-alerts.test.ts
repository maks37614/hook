import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Kline } from '../src/types';
import { createScalperAnalyzer } from '../src/components/hookchart/scalperMode';
import { detectTerminalMarketSignals, detectTwoTouchTrendApproaches,
  detectTwoTouchHorizontalApproaches, majorRoundPrice, terminalAlertMarketScope } from '../src/utils/terminalLiveAlerts';

const scope = 'binance:futures:BTCUSDT:1m';
function candles(count = 75, initial = 10): Kline[] {
  return Array.from({ length: count }, (_, index) => {
    const close = initial + Math.sin(index * Math.PI / 5) * initial * .0002;
    return { time: 1_730_000_000 + 60 * index,
      open: close, close, high: close * 1.0006, low: close * .9994, volume: 100 };
  });
}
const scan = (rows: Kline[]) => detectTerminalMarketSignals(rows, scope, createScalperAnalyzer());

test('major round numbers support small and large market quotes', () => {
  assert.equal(majorRoundPrice(.699)?.level, .7);
  assert.equal(majorRoundPrice(.21)?.level, .2);
  assert.equal(majorRoundPrice(23456)?.level, 23000);
  assert.equal(majorRoundPrice(.00511)?.level, .005);
  assert.equal(majorRoundPrice(0), null);
  assert.equal(majorRoundPrice(Number.NaN), null);
});

test('one sharp live candle emits a direction-aware impulse without any future candles', () => {
  const rows = candles();
  const last = rows.length - 1;
  rows[last] = { ...rows[last], open: 10, close: 10.9, high: 10.91, low: 9.99 };
  const signals = scan(rows);
  assert.ok(signals.some(signal => signal.kind === 'impulse' && signal.side === 'up'
    && (signal.movementPct || 0) >= 8));
  rows[last] = { ...rows[last], open: 10.9, close: 10, high: 10.91, low: 9.99 };
  assert.ok(scan(rows).some(signal => signal.kind === 'impulse' && signal.side === 'down'));
});

test('near a major round number alerts only on a genuine fresh approach', () => {
  const rows = candles(75, .695);
  const latest = rows.length - 1;
  rows[latest - 1] = { ...rows[latest - 1], close: .695, high: .696, low: .694 };
  rows[latest] = { ...rows[latest], open: .698, close: .6995, high: .6996, low: .697 };
  assert.ok(scan(rows).some(s => s.kind === 'round' && s.level === .7));
  rows[latest - 1] = { ...rows[latest - 1], close: .6994, high: .6995, low: .694 };
  assert.ok(!scan(rows).some(s => s.kind === 'round'),
    'already near the level does not generate repeated round-number events');
});

test('two separated confirmed wick highs can form a third-touch trendline approach', () => {
  const rows = Array.from({ length: 60 }, (_, index): Kline => {
    const close = 9.9 - .005 * index;
    return { time: 1_730_000_000 + index * 60, open: close, close,
      high: close + .02, low: close - .02, volume: 100 };
  });
  rows[28].high = 10.5;
  rows[40].high = 10.3;
  rows[59] = { ...rows[59], open: 9.94, close: 9.96, high: 9.97, low: 9.93 };
  const approaches = detectTwoTouchTrendApproaches(rows);
  assert.ok(approaches.some(s => s.kind === 'structure' && s.side === 'up'
    && s.structure === 'trendline' && (s.distancePct || 0) <= .4));
  rows[59].close = 10.2; rows[59].high = 10.21;
  assert.ok(!detectTwoTouchTrendApproaches(rows).some(s => s.side === 'up'),
    'already broken lines are not upcoming approaches');
});

test('two distinct confirmed highs with a visible intervening retreat signal a third test', () => {
  const rows = Array.from({ length: 60 }, (_, index): Kline => {
    const close = 9.9 - index * .005;
    return { time: 1_730_000_000 + 60 * index, open: close, close,
      high: close + .02, low: close - .02, volume: 100 };
  });
  rows[28].high = 10.5;
  rows[40].high = 10.5;
  rows[59] = { ...rows[59], open: 10.45, close: 10.48, high: 10.49, low: 10.44 };
  assert.ok(detectTwoTouchHorizontalApproaches(rows).some(s =>
    s.kind === 'structure' && s.structure === 'horizontal' && s.side === 'up'));
  rows[40].high = 10.9;
  assert.ok(!detectTwoTouchHorizontalApproaches(rows).some(s => s.side === 'up'),
    'unequal peaks are not a double-tested resistance');
});

test('broken history and fewer than 32 candles suppress unsupported classifications', () => {
  assert.deepEqual(scan(candles(20)), []);
  const rows = candles(36);
  rows[rows.length - 5].time += 30;
  assert.deepEqual(scan(rows), [], 'no fitting through a missing exchange candle');
});

test('scopes isolate exchange, spot/futures, timeframe and coin', () => {
  const a = terminalAlertMarketScope('binance', 'futures', 'btcusdt', '1m');
  const b = terminalAlertMarketScope('bybit', 'futures', 'BTCUSDT', '1m');
  const c = terminalAlertMarketScope('binance', 'spot', 'BTCUSDT', '1m');
  assert.equal(a, scope);
  assert.equal(new Set([a, b, c]).size, 3);
});

test('Terminal opt-in defaults off and chart feed shares transport without polling', () => {
  const page = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  const hook = readFileSync(new URL('../src/utils/useTerminalLiveAlerts.ts', import.meta.url), 'utf8');
  assert.match(page, /config\.terminalMarketAlerts === true/);
  assert.match(page, /aria-pressed=\{terminalAlertsEnabled\}/);
  assert.match(hook, /subscribeSharedKlines/);
  assert.match(hook, /fetchSharedHistoricalKlines/);
  assert.doesNotMatch(hook, /setInterval\(/);
});
